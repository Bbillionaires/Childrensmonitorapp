import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
process.env.STRIPE_PARENT_PRICE_ID = "price_parent_fake";
process.env.STRIPE_API_CLIENT_PRICE_ID = "price_api_client_fake";
delete process.env.RESEND_API_KEY;
delete process.env.YOUTUBE_API_KEY;

// Stubs only the Stripe-SDK-touching boundary (createBillingClient), the same way
// deep-signals.test.ts mocks @app/ai's createThumbnailAnalyzer rather than reaching two levels
// down into "openai" itself — extractSubscriptionEvent/isSubscriptionEntitled stay real, so
// this test exercises the actual business logic, not a reimplementation of it.
const createCheckoutSessionMock = vi.fn();
const constructEventMock = vi.fn();

vi.mock("@app/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/billing")>();
  return {
    ...actual,
    createBillingClient: vi.fn((secretKey: string | undefined) =>
      secretKey
        ? { createCheckoutSession: createCheckoutSessionMock, constructWebhookEvent: constructEventMock }
        : undefined,
    ),
  };
});

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { registerParent, createChild, cookieHeader, jarFromInjectResponse } = await import("./helpers.js");

function subscriptionEvent(ownerKind: "parent" | "api_client", ownerId: string, status: string, subId = "sub_1") {
  return {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: subId,
        customer: `cus_${ownerId}`,
        status,
        metadata: { ownerKind, ownerId },
      },
    },
  };
}

async function postWebhook(app: FastifyInstance, event: unknown) {
  constructEventMock.mockReturnValueOnce(event);
  return app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    headers: { "content-type": "application/json", "stripe-signature": "test-sig" },
    payload: JSON.stringify({ irrelevant: "raw body, constructEvent is mocked" }),
  });
}

describe("Milestone 10: parent subscription + webhook", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    createCheckoutSessionMock.mockReset();
    constructEventMock.mockReset();
    await prisma.user.deleteMany();
    await prisma.apiClient.deleteMany();
  });

  it("gates /api/parents/children behind an active subscription, but exempts GET /me", async () => {
    // registerParent's own ParentSubscription write would mask the gate, so register via the
    // raw route and skip the helper's post-registration activation for this one test.
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "ungated@example.com", password: "Str0ngPassw0rd!", displayName: "No Sub" },
    });
    expect(response.statusCode).toBe(201);
    const jar = { accessToken: response.cookies.find((c) => c.name === "access_token")?.value };

    const me = await app.inject({ method: "GET", url: "/api/parents/me", headers: { cookie: `access_token=${jar.accessToken}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().subscriptionStatus).toBeNull();

    const children = await app.inject({
      method: "GET",
      url: "/api/parents/children",
      headers: { cookie: `access_token=${jar.accessToken}` },
    });
    expect(children.statusCode).toBe(402);
    expect(children.json().code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("registerParent's own activation unblocks the gate (sanity check on the test helper itself)", async () => {
    const jar = await registerParent(app, "activated@example.com");
    const response = await app.inject({
      method: "GET",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(jar) },
    });
    expect(response.statusCode).toBe(200);
  });

  it("POST /api/billing/checkout-session requires a parent session and returns Stripe's URL", async () => {
    const unauth = await app.inject({ method: "POST", url: "/api/billing/checkout-session" });
    expect(unauth.statusCode).toBe(401);

    const jar = await registerParent(app, "checkout-parent@example.com");
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/billing/checkout-session",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().url).toBe("https://checkout.stripe.com/cs_1");
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: "price_parent_fake", ownerKind: "parent" }),
    );
  });

  it("grants a 7-day free trial to a genuinely new parent's first checkout", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "trial-eligible@example.com", password: "Str0ngPassw0rd!", displayName: "New Parent" },
    });
    expect(register.statusCode).toBe(201);
    const jar = jarFromInjectResponse(register.cookies);
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_trial", url: "https://checkout.stripe.com/cs_trial" });

    const response = await app.inject({
      method: "POST",
      url: "/api/billing/checkout-session",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    });

    expect(response.statusCode).toBe(200);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.objectContaining({ trialPeriodDays: 7 }));
  });

  it("does not grant a second trial to a parent who already has a subscription row", async () => {
    // registerParent's own helper writes a ParentSubscription row (the same way a webhook
    // would after a real payment) — this parent has therefore already "had" a subscription,
    // trialed or not, so a later checkout call (e.g. after canceling) must not grant another.
    const jar = await registerParent(app, "already-subscribed@example.com");
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_no_trial", url: "https://checkout.stripe.com/cs_no_trial" });

    const response = await app.inject({
      method: "POST",
      url: "/api/billing/checkout-session",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    });

    expect(response.statusCode).toBe(200);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ trialPeriodDays: undefined }),
    );
  });

  it("never grants a trial to a commercial API client's checkout", async () => {
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_b2b_trial", url: "https://checkout.stripe.com/cs_b2b_trial" });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: { name: "No Trial Co", contactEmail: "no-trial@example.com" },
    });

    expect(response.statusCode).toBe(201);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKind: "api_client", trialPeriodDays: undefined }),
    );
  });

  it("rejects a webhook with no Stripe-Signature header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/billing/webhook",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a webhook whose signature Stripe's SDK rejects", async () => {
    constructEventMock.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": "bad" },
      payload: "{}",
    });
    expect(response.statusCode).toBe(400);
  });

  it("a verified subscription.updated event activates a parent's subscription, unblocking the gate", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "webhook-parent@example.com", password: "Str0ngPassw0rd!", displayName: "Webhook Parent" },
    });
    const accessToken = response.cookies.find((c) => c.name === "access_token")!.value;
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "webhook-parent@example.com" },
      include: { parentAccount: true },
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/parents/children",
      headers: { cookie: `access_token=${accessToken}` },
    });
    expect(before.statusCode).toBe(402);

    const webhookResponse = await postWebhook(
      app,
      subscriptionEvent("parent", user.parentAccount!.id, "active"),
    );
    expect(webhookResponse.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/parents/children",
      headers: { cookie: `access_token=${accessToken}` },
    });
    expect(after.statusCode).toBe(200);

    const subscription = await prisma.parentSubscription.findUnique({
      where: { parentAccountId: user.parentAccount!.id },
    });
    expect(subscription?.status).toBe("ACTIVE");
  });

  it("ignores a webhook event missing the ownerKind/ownerId metadata this app always sets, without erroring", async () => {
    const response = await postWebhook(app, {
      type: "customer.subscription.updated",
      data: { object: { id: "sub_x", customer: "cus_x", status: "active", metadata: {} } },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("Milestone 10: commercial Supervision Score API", () => {
  let app: FastifyInstance;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    createCheckoutSessionMock.mockReset();
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_b2b", url: "https://checkout.stripe.com/cs_b2b" });
    constructEventMock.mockReset();
    await prisma.apiClient.deleteMany();
    await prisma.content.deleteMany();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function signUpAndActivate(email: string, name = "Acme Co", targetApp: FastifyInstance = app): Promise<string> {
    // Isolates this call's share of the mock email log — without this, a second call within
    // the same test would still see the first call's logged key and (since .match() finds the
    // first occurrence) incorrectly extract the FIRST client's key instead of its own.
    consoleLogSpy.mockClear();
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_b2b", url: "https://checkout.stripe.com/cs_b2b" });
    const signup = await targetApp.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: { name, contactEmail: email },
    });
    expect(signup.statusCode).toBe(201);
    const { apiClientId } = signup.json();

    // A distinct subscription id per client — ApiClient.stripeSubscriptionId is unique, the
    // same way two different Stripe customers never share one subscription.
    const webhook = await postWebhook(targetApp, subscriptionEvent("api_client", apiClientId, "active", `sub_${apiClientId}`));
    expect(webhook.statusCode).toBe(200);

    const loggedEmail = consoleLogSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    const match = loggedEmail.match(/fsk_live_[A-Za-z0-9_-]+/);
    if (!match) throw new Error("No API key found in the mock email output");
    return match[0];
  }

  it("signs up a business, issues it a key on activation, and the key-status endpoint reflects it", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: { name: "Acme Co", contactEmail: "acme@example.com" },
    });
    expect(signup.statusCode).toBe(201);
    const { apiClientId } = signup.json();

    const beforeActivation = await app.inject({ method: "GET", url: `/api/v1/clients/${apiClientId}/key-status` });
    expect(beforeActivation.json()).toEqual({ status: "INCOMPLETE", hasKey: false });

    await postWebhook(app, subscriptionEvent("api_client", apiClientId, "active"));

    const afterActivation = await app.inject({ method: "GET", url: `/api/v1/clients/${apiClientId}/key-status` });
    expect(afterActivation.json()).toEqual({ status: "ACTIVE", hasKey: true });
  });

  it("rejects /api/v1/analyze with no key or an invalid key", async () => {
    const noKey = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { contentUrl: "https://example.com" } });
    expect(noKey.statusCode).toBe(401);

    const badKey = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      headers: { authorization: "Bearer fsk_live_not_a_real_key" },
      payload: { contentUrl: "https://example.com" },
    });
    expect(badKey.statusCode).toBe(401);
  });

  it("rejects a valid key once its client's subscription lapses, without revoking the key itself", async () => {
    const rawKey = await signUpAndActivate("lapsing@example.com");
    const apiClient = await prisma.apiClient.findUniqueOrThrow({ where: { contactEmail: "lapsing@example.com" } });

    await postWebhook(app, subscriptionEvent("api_client", apiClient.id, "past_due"));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { contentUrl: "https://example.com" },
    });
    expect(response.statusCode).toBe(402);

    const keys = await prisma.apiKey.findMany({ where: { apiClientId: apiClient.id } });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.revokedAt).toBeNull();
  });

  it("a valid key with an active subscription can call /api/v1/analyze and gets the documented response shape", async () => {
    const rawKey = await signUpAndActivate("scorer@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { contentUrl: "https://www.example.com/family-friendly-page" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      contentIdentifier: expect.any(String),
      supervisionScore: expect.any(Number),
      confidence: expect.any(Number),
      riskFlags: expect.any(Array),
      explanation: expect.any(String),
      analysisVersion: expect.any(String),
    });
    expect(typeof body.categoryScores).toBe("object");

    const usage = await prisma.apiUsageLog.findMany({ where: { endpoint: "POST /api/v1/analyze" } });
    expect(usage).toHaveLength(1);
    expect(usage[0]?.contentId).toBe(body.contentIdentifier);
  });

  it("rate-limits /api/v1/analyze per API key, independently of other clients", async () => {
    // A dedicated app instance so the global 200/minute-per-IP limiter (app.ts) — shared,
    // cumulative state across every other test in this describe block's own `app` — can't
    // confuse this test's count. This test's own scoped, per-key limiter (v1-analyze.ts) is
    // what's actually under test.
    const testApp = await buildApp();
    await testApp.ready();
    try {
      const rawKeyA = await signUpAndActivate("rate-a@example.com", "Rate A", testApp);
      const rawKeyB = await signUpAndActivate("rate-b@example.com", "Rate B", testApp);

      let lastStatus = 200;
      for (let i = 0; i < 101; i++) {
        const response = await testApp.inject({
          method: "POST",
          url: "/api/v1/analyze",
          headers: { authorization: `Bearer ${rawKeyA}` },
          payload: { contentUrl: `https://www.example.com/page-${i}` },
        });
        lastStatus = response.statusCode;
      }
      expect(lastStatus).toBe(429);

      // A different client's own limit is untouched by client A's usage.
      const responseB = await testApp.inject({
        method: "POST",
        url: "/api/v1/analyze",
        headers: { authorization: `Bearer ${rawKeyB}` },
        payload: { contentUrl: "https://www.example.com/other-page" },
      });
      expect(responseB.statusCode).toBe(200);
    } finally {
      await testApp.close();
    }
  }, 30000);
});

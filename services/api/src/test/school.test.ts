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
process.env.STRIPE_SCHOOL_PRICE_ID = "price_school_fake";
process.env.STRIPE_SCHOOL_BASE_PRICE_ID = "price_school_base_fake";
delete process.env.RESEND_API_KEY;
delete process.env.YOUTUBE_API_KEY;

// Same package-boundary mock as billing.test.ts — mocking "stripe" directly doesn't reliably
// intercept a dependency-of-a-dependency across this pnpm workspace.
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
const { jarFromInjectResponse, cookieHeader } = await import("./helpers.js");

function schoolSubscriptionEvent(schoolAccountId: string, status: string, seatCount: number) {
  return {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: `sub_${schoolAccountId}`,
        customer: `cus_${schoolAccountId}`,
        status,
        metadata: { ownerKind: "school", ownerId: schoolAccountId },
        // Two line items, matching the real checkout (see createSchoolCheckoutSession) — the
        // base fee is deliberately listed first here to prove the school branch of
        // applySubscriptionEvent matches by priceId, not by array position.
        items: {
          data: [
            { price: "price_school_base_fake", quantity: 1 },
            { price: "price_school_fake", quantity: seatCount },
          ],
        },
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

async function registerSchool(app: FastifyInstance, email: string, schoolName = "Maple Elementary") {
  const response = await app.inject({
    method: "POST",
    url: "/api/schools/register",
    payload: { schoolName, adminName: "Principal Lee", email, password: "Str0ngPassw0rd!" },
  });
  expect(response.statusCode).toBe(201);
  return jarFromInjectResponse(response.cookies);
}

async function registerParentRaw(app: FastifyInstance, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "Str0ngPassw0rd!", displayName: "Test Parent" },
  });
  expect(response.statusCode).toBe(201);
  return jarFromInjectResponse(response.cookies);
}

describe("Milestone 11: school seats", () => {
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
  });

  it("a school can register, sign in, and see its own (initially empty) seat summary", async () => {
    const jar = await registerSchool(app, "admin@maple.example.com");

    const me = await app.inject({ method: "GET", url: "/api/schools/me", headers: { cookie: cookieHeader(jar) } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ name: "Maple Elementary", status: "INCOMPLETE", seatCount: 0, seatsUsed: 0 });

    const login = await app.inject({
      method: "POST",
      url: "/api/schools/login",
      payload: { email: "admin@maple.example.com", password: "Str0ngPassw0rd!" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("a school session cannot reach /api/parents/* and a parent session cannot reach /api/schools/*", async () => {
    const schoolJar = await registerSchool(app, "cross-admin@maple.example.com");
    const parentJar = await registerParentRaw(app, "cross-parent@example.com");

    const parentsWithSchoolCookie = await app.inject({
      method: "GET",
      url: "/api/parents/me",
      headers: { cookie: cookieHeader(schoolJar) },
    });
    expect(parentsWithSchoolCookie.statusCode).toBe(401);

    const schoolsWithParentCookie = await app.inject({
      method: "GET",
      url: "/api/schools/me",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(schoolsWithParentCookie.statusCode).toBe(401);
  });

  it("rejects an invite before any seats have been purchased, then accepts once the webhook activates seats", async () => {
    const schoolJar = await registerSchool(app, "seat-admin@maple.example.com");
    const me = await app.inject({ method: "GET", url: "/api/schools/me", headers: { cookie: cookieHeader(schoolJar) } });
    const schoolAccountId = me.json().id as string;

    const refused = await app.inject({
      method: "POST",
      url: "/api/schools/invites",
      headers: { cookie: cookieHeader(schoolJar), "x-csrf-token": schoolJar.csrfToken! },
      payload: { email: "family1@example.com" },
    });
    expect(refused.statusCode).toBe(409);

    await postWebhook(app, schoolSubscriptionEvent(schoolAccountId, "active", 1));

    const accepted = await app.inject({
      method: "POST",
      url: "/api/schools/invites",
      headers: { cookie: cookieHeader(schoolJar), "x-csrf-token": schoolJar.csrfToken! },
      payload: { email: "family1@example.com" },
    });
    expect(accepted.statusCode).toBe(201);

    const secondRefused = await app.inject({
      method: "POST",
      url: "/api/schools/invites",
      headers: { cookie: cookieHeader(schoolJar), "x-csrf-token": schoolJar.csrfToken! },
      payload: { email: "family2@example.com" },
    });
    expect(secondRefused.statusCode).toBe(409);
  });

  it("a parent accepting a seat invite gains access with no personal subscription, and GET /me reflects the school's status", async () => {
    const schoolJar = await registerSchool(app, "grant-admin@maple.example.com");
    const schoolId = (
      await app.inject({ method: "GET", url: "/api/schools/me", headers: { cookie: cookieHeader(schoolJar) } })
    ).json().id as string;
    await postWebhook(app, schoolSubscriptionEvent(schoolId, "active", 5));
    await app.inject({
      method: "POST",
      url: "/api/schools/invites",
      headers: { cookie: cookieHeader(schoolJar), "x-csrf-token": schoolJar.csrfToken! },
      payload: { email: "sponsored-parent@example.com" },
    });
    // The raw token only ever exists in the email that was "sent" (ConsoleEmailSender just
    // logs it — not practically readable from here), so swap in a known token's hash the same
    // way the real one would have been stored, to exercise the preview/accept endpoints with
    // a token we actually have.
    const { hashOpaqueToken } = await import("@app/auth");
    const rawToken = "test-raw-token-for-this-invite";
    await prisma.schoolSeatInvite.updateMany({
      where: { schoolAccountId: schoolId },
      data: { tokenHash: hashOpaqueToken(rawToken) },
    });

    const parentJar = await registerParentRaw(app, "sponsored-parent@example.com");

    const beforeAccept = await app.inject({
      method: "GET",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(beforeAccept.statusCode).toBe(402);

    const preview = await app.inject({
      method: "GET",
      url: `/api/parents/school-invites/${rawToken}`,
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ schoolName: "Maple Elementary", status: "PENDING" });

    const accept = await app.inject({
      method: "POST",
      url: `/api/parents/school-invites/${rawToken}/accept`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
    });
    expect(accept.statusCode).toBe(200);

    const afterAccept = await app.inject({
      method: "GET",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(afterAccept.statusCode).toBe(200);

    const me = await app.inject({ method: "GET", url: "/api/parents/me", headers: { cookie: cookieHeader(parentJar) } });
    expect(me.json().subscriptionStatus).toBe("ACTIVE");

    // Re-accepting the same (now ACCEPTED) invite is refused.
    const reaccept = await app.inject({
      method: "POST",
      url: `/api/parents/school-invites/${rawToken}/accept`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
    });
    expect(reaccept.statusCode).toBe(409);
  });

  it("refuses to accept an expired invite", async () => {
    const schoolJar = await registerSchool(app, "expire-admin@maple.example.com");
    const schoolId = (
      await app.inject({ method: "GET", url: "/api/schools/me", headers: { cookie: cookieHeader(schoolJar) } })
    ).json().id as string;
    await postWebhook(app, schoolSubscriptionEvent(schoolId, "active", 5));
    await app.inject({
      method: "POST",
      url: "/api/schools/invites",
      headers: { cookie: cookieHeader(schoolJar), "x-csrf-token": schoolJar.csrfToken! },
      payload: { email: "expired-parent@example.com" },
    });

    const { hashOpaqueToken } = await import("@app/auth");
    const rawToken = "test-raw-token-expired";
    await prisma.schoolSeatInvite.updateMany({
      where: { schoolAccountId: schoolId },
      data: { tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() - 1000) },
    });

    const parentJar = await registerParentRaw(app, "expired-parent@example.com");
    const accept = await app.inject({
      method: "POST",
      url: `/api/parents/school-invites/${rawToken}/accept`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
    });
    expect(accept.statusCode).toBe(409);
  });
});

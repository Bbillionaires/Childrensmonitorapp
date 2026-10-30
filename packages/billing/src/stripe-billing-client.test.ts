import { beforeEach, describe, expect, it, vi } from "vitest";

const createCheckoutSessionMock = vi.fn();
const constructEventMock = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: createCheckoutSessionMock } },
    webhooks: { constructEvent: constructEventMock },
  })),
}));

const Stripe = (await import("stripe")).default;
const { StripeBillingClient, extractSubscriptionEvent, createBillingClient } = await import(
  "./stripe-billing-client.js"
);
const { isSubscriptionEntitled } = await import("./types.js");

function fakeStripeClient() {
  return new StripeBillingClient(new (Stripe as unknown as new (key: string) => never)("sk_test_fake"));
}

describe("StripeBillingClient", () => {
  beforeEach(() => {
    createCheckoutSessionMock.mockReset();
    constructEventMock.mockReset();
  });

  it("creates a subscription Checkout Session tagged with ownerKind/ownerId metadata", async () => {
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" });

    const client = fakeStripeClient();
    const result = await client.createCheckoutSession({
      priceId: "price_parent_tier",
      customerEmail: "parent@example.com",
      successUrl: "https://app.example.com/subscribe/success",
      cancelUrl: "https://app.example.com/subscribe",
      ownerKind: "parent",
      ownerId: "parent-account-1",
    });

    expect(result).toEqual({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" });
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer_email: "parent@example.com",
        client_reference_id: "parent:parent-account-1",
        metadata: { ownerKind: "parent", ownerId: "parent-account-1" },
        subscription_data: { metadata: { ownerKind: "parent", ownerId: "parent-account-1" } },
      }),
    );
  });

  it("throws if Stripe returns no Checkout Session URL", async () => {
    createCheckoutSessionMock.mockResolvedValue({ id: "cs_123", url: null });
    const client = fakeStripeClient();

    await expect(
      client.createCheckoutSession({
        priceId: "price_x",
        customerEmail: "a@example.com",
        successUrl: "https://x/success",
        cancelUrl: "https://x/cancel",
        ownerKind: "api_client",
        ownerId: "client-1",
      }),
    ).rejects.toThrow(/did not return a Checkout Session URL/);
  });

  it("delegates webhook signature verification to the Stripe SDK", () => {
    const fakeEvent = { id: "evt_1", type: "customer.subscription.updated" };
    constructEventMock.mockReturnValue(fakeEvent);

    const client = fakeStripeClient();
    const event = client.constructWebhookEvent("raw-body", "sig-header", "whsec_test");

    expect(event).toBe(fakeEvent);
    expect(constructEventMock).toHaveBeenCalledWith("raw-body", "sig-header", "whsec_test");
  });
});

describe("extractSubscriptionEvent", () => {
  function subscriptionEvent(type: string, overrides: Record<string, unknown> = {}) {
    return {
      type,
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: { ownerKind: "parent", ownerId: "parent-account-1" },
          ...overrides,
        },
      },
    } as never;
  }

  it("extracts owner/customer/status from a subscription lifecycle event", () => {
    const result = extractSubscriptionEvent(subscriptionEvent("customer.subscription.created"));
    expect(result).toEqual({
      ownerKind: "parent",
      ownerId: "parent-account-1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      status: "ACTIVE",
    });
  });

  it("maps every Stripe status to this app's SubscriptionStatus enum", () => {
    const cases: Array<[string, string]> = [
      ["incomplete", "INCOMPLETE"],
      ["incomplete_expired", "CANCELED"],
      ["trialing", "TRIALING"],
      ["active", "ACTIVE"],
      ["past_due", "PAST_DUE"],
      ["canceled", "CANCELED"],
      ["unpaid", "UNPAID"],
      ["paused", "PAST_DUE"],
    ];
    for (const [stripeStatus, expected] of cases) {
      const result = extractSubscriptionEvent(
        subscriptionEvent("customer.subscription.updated", { status: stripeStatus }),
      );
      expect(result?.status).toBe(expected);
    }
  });

  it("reads the customer id whether or not Stripe expanded it to a full object", () => {
    const result = extractSubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", { customer: { id: "cus_expanded" } }),
    );
    expect(result?.stripeCustomerId).toBe("cus_expanded");
  });

  it("ignores events of an unrelated type", () => {
    expect(extractSubscriptionEvent({ type: "invoice.paid", data: { object: {} } } as never)).toBeUndefined();
  });

  it("ignores a subscription event missing the ownerKind/ownerId metadata this app always sets", () => {
    const result = extractSubscriptionEvent(
      subscriptionEvent("customer.subscription.created", { metadata: {} }),
    );
    expect(result).toBeUndefined();
  });

  it("ignores a subscription event with an unrecognized ownerKind", () => {
    const result = extractSubscriptionEvent(
      subscriptionEvent("customer.subscription.created", { metadata: { ownerKind: "bogus", ownerId: "x" } }),
    );
    expect(result).toBeUndefined();
  });
});

describe("createBillingClient", () => {
  it("returns undefined when no secret key is configured, so callers fail honestly rather than fabricate billing", () => {
    expect(createBillingClient(undefined)).toBeUndefined();
  });

  it("returns a client when a secret key is configured", () => {
    expect(createBillingClient("sk_test_123")).toBeInstanceOf(StripeBillingClient);
  });
});

describe("isSubscriptionEntitled", () => {
  it("entitles ACTIVE and TRIALING, nothing else", () => {
    expect(isSubscriptionEntitled("ACTIVE")).toBe(true);
    expect(isSubscriptionEntitled("TRIALING")).toBe(true);
    expect(isSubscriptionEntitled("INCOMPLETE")).toBe(false);
    expect(isSubscriptionEntitled("PAST_DUE")).toBe(false);
    expect(isSubscriptionEntitled("CANCELED")).toBe(false);
    expect(isSubscriptionEntitled("UNPAID")).toBe(false);
    expect(isSubscriptionEntitled(null)).toBe(false);
    expect(isSubscriptionEntitled(undefined)).toBe(false);
  });
});

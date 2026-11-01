import Stripe from "stripe";
import type {
  CheckoutSession,
  CreateCheckoutSessionParams,
  SubscriptionEventPayload,
  SubscriptionOwnerKind,
  SubscriptionStatusValue,
} from "./types.js";

const SUBSCRIPTION_LIFECYCLE_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Stripe's own subscription.status has two values this app's simpler SubscriptionStatus enum
 * doesn't need as distinct states: `incomplete_expired` (the customer never completed payment
 * in time — functionally the same as never having subscribed) folds into CANCELED, and
 * `paused` (a Stripe feature this app doesn't use, included only so the mapping is total)
 * folds into PAST_DUE, since both mean "not currently entitled to access."
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatusValue {
  switch (status) {
    case "incomplete":
      return "INCOMPLETE";
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAST_DUE";
    default:
      // Stripe's own type includes an open `OtherString` case for statuses it might add in
      // the future. Treat anything unrecognized as not-entitled rather than silently granting
      // access — the safe direction to fail in for a billing gate.
      return "PAST_DUE";
  }
}

function customerIdOf(customer: Stripe.Subscription["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Thin wrapper over the Stripe SDK — the only place in this codebase that calls Stripe
 * directly. Business logic (what a webhook event means for a ParentSubscription/ApiClient
 * row) lives in services/api, the same separation packages/ai keeps between "talk to the
 * provider" and "what to do with the result."
 */
export class StripeBillingClient {
  constructor(private readonly stripe: Stripe) {}

  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession> {
    const metadata = { ownerKind: params.ownerKind, ownerId: params.ownerId };
    const lineItems = [{ price: params.priceId, quantity: params.quantity ?? 1 }];
    if (params.additionalLineItem) {
      lineItems.push({ price: params.additionalLineItem.priceId, quantity: params.additionalLineItem.quantity ?? 1 });
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: params.customerEmail,
      line_items: lineItems,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: `${params.ownerKind}:${params.ownerId}`,
      metadata,
      subscription_data: {
        metadata,
        ...(params.trialPeriodDays ? { trial_period_days: params.trialPeriodDays } : {}),
      },
      // `managed_payments` is a real, current Checkout Session parameter (Stripe's automatic
      // tax calculation/remittance, on by default for this account) that the installed SDK's
      // types (stripe@23.1.0) don't yet know about — it requires every Price's Product to
      // carry a tax code, which this operator's products don't have configured. Disabling it
      // here is an explicit operator choice to unblock Checkout without that Dashboard setup;
      // the operator is responsible for their own sales-tax handling as a result.
      ...({ managed_payments: { enabled: false } } as Record<string, unknown>),
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout Session URL");
    }
    return { id: session.id, url: session.url };
  }

  /**
   * Verifies the raw webhook payload's HMAC signature and parses it into a typed Stripe.Event.
   * Throws on a missing/invalid signature — the caller (services/api's webhook route) must
   * reject the request (400) rather than process an unverified event; without this check,
   * anyone could POST a fake "subscription active" event.
   */
  constructWebhookEvent(rawBody: string | Buffer, signatureHeader: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  }
}

/**
 * Pulls the (ownerKind, ownerId, customer, subscription, status) tuple out of a subscription
 * lifecycle event, or `undefined` for any other event type / one missing the metadata this
 * app always sets at Checkout Session creation (which should never happen for an event this
 * app's own Checkout Sessions produced, but a malformed/unexpected event is ignored rather
 * than crashing the webhook handler).
 */
export function extractSubscriptionEvent(event: Stripe.Event): SubscriptionEventPayload | undefined {
  if (!SUBSCRIPTION_LIFECYCLE_EVENTS.has(event.type)) return undefined;

  const subscription = event.data.object as Stripe.Subscription;
  const ownerKind = subscription.metadata?.ownerKind as SubscriptionOwnerKind | undefined;
  const ownerId = subscription.metadata?.ownerId;
  if (ownerKind !== "parent" && ownerKind !== "api_client" && ownerKind !== "school") return undefined;
  if (!ownerId) return undefined;

  return {
    ownerKind,
    ownerId,
    stripeCustomerId: customerIdOf(subscription.customer),
    stripeSubscriptionId: subscription.id,
    status: mapStripeStatus(subscription.status),
    lineItems: (subscription.items?.data ?? []).map((item) => ({
      priceId: typeof item.price === "string" ? item.price : item.price.id,
      quantity: item.quantity ?? 1,
    })),
  };
}

export function createBillingClient(secretKey: string | undefined): StripeBillingClient | undefined {
  if (!secretKey) return undefined;
  return new StripeBillingClient(new Stripe(secretKey));
}

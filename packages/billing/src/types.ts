/**
 * Two independent kinds of Stripe subscription in this app — a parent's own access to this
 * app, and a business's access to the commercial Supervision Score API — kept apart with a
 * tagged `ownerKind` in Stripe metadata (set at Checkout Session creation and carried forward
 * onto the Subscription object Stripe creates from it) so a webhook handler can dispatch to
 * the right table without any Stripe-side customer lookup.
 */
export type SubscriptionOwnerKind = "parent" | "api_client" | "school";

export const SUBSCRIPTION_STATUSES = [
  "INCOMPLETE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "UNPAID",
] as const;
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

export interface CreateCheckoutSessionParams {
  /** A Stripe Price ID (price_...) configured in the operator's own Stripe Dashboard — this
   *  codebase never hardcodes a dollar amount. */
  priceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  ownerKind: SubscriptionOwnerKind;
  ownerId: string;
  /** Grants a free trial on the Subscription Stripe creates from this Checkout Session.
   *  Only ever set by the caller for an owner who has never had a subscription before —
   *  this wrapper applies whatever it's given with no eligibility logic of its own. */
  trialPeriodDays?: number;
  /** Line-item quantity — only ever set by the "school" seat-based checkout path (Stripe
   *  multiplies the per-seat price by this). Omitted (defaults to 1) for parent/api_client. */
  quantity?: number;
  /** A second, independent Checkout line item — only ever the "school" tier's flat monthly
   *  platform fee (quantity defaults to 1), billed on the same subscription alongside the
   *  per-seat `priceId` above. Omitted for parent/api_client, which are single-line-item. */
  additionalLineItem?: { priceId: string; quantity?: number };
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** The normalized result of a subscription-lifecycle webhook event, once verified and parsed. */
export interface SubscriptionEventPayload {
  ownerKind: SubscriptionOwnerKind;
  ownerId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatusValue;
  /** Every line item on the subscription at event time (priceId + quantity), read straight
   *  from Stripe's own event — never trusted from anywhere else. A "school" subscription
   *  carries two (the per-seat price and the flat base-fee price); parent/api_client carry
   *  one. The school branch of applySubscriptionEvent matches on priceId to find the seat
   *  count specifically, rather than assuming line-item order. */
  lineItems: Array<{ priceId: string; quantity: number }>;
}

/**
 * Whether a subscription status entitles its owner to use the gated feature — the single
 * place both the parent dashboard gate and the commercial API's key auth decide this, so the
 * two can never silently drift (e.g. one allowing TRIALING and the other not).
 */
export function isSubscriptionEntitled(status: SubscriptionStatusValue | null | undefined): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

import { prisma } from "@app/database";
import { generateApiKey } from "@app/auth";
import type { StripeBillingClient, SubscriptionEventPayload } from "@app/billing";
import type { Env } from "@app/config";
import { writeAuditLog } from "./audit.js";
import type { EmailSender } from "./email.js";

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Billing is not configured — STRIPE_SECRET_KEY is not set");
    this.name = "BillingNotConfiguredError";
  }
}

export class NotFoundError extends Error {}

function requireClient(billingClient: StripeBillingClient | undefined): StripeBillingClient {
  if (!billingClient) throw new BillingNotConfiguredError();
  return billingClient;
}

/** Every eligible new parent subscription gets this many days free before the first charge. */
const PARENT_TRIAL_PERIOD_DAYS = 7;

/**
 * Starts (or resumes) a parent's subscription checkout. Safe to call repeatedly — Stripe
 * Checkout is itself idempotent per session, and a parent with no existing subscription row
 * yet is the normal first-time case (ParentSubscription is created for real only once the
 * webhook confirms payment, never optimistically here).
 *
 * The free trial is granted only the first time: a `ParentSubscription` row is created exactly
 * once per parent account (upserted from then on — see applySubscriptionEvent) and is never
 * deleted, even after a cancellation, so its mere existence means this parent has already
 * started a subscription before — checking for it here is sufficient to stop the same parent
 * claiming a second trial by canceling and re-subscribing.
 */
export async function createParentCheckoutSession(
  env: Env,
  billingClient: StripeBillingClient | undefined,
  parentAccountId: string,
  userEmail: string,
): Promise<string> {
  const client = requireClient(billingClient);
  if (!env.STRIPE_PARENT_PRICE_ID) {
    throw new Error("STRIPE_PARENT_PRICE_ID is not configured");
  }

  const existingSubscription = await prisma.parentSubscription.findUnique({ where: { parentAccountId } });

  const session = await client.createCheckoutSession({
    priceId: env.STRIPE_PARENT_PRICE_ID,
    customerEmail: userEmail,
    successUrl: `${env.WEB_APP_ORIGIN}/subscribe/success`,
    cancelUrl: `${env.WEB_APP_ORIGIN}/subscribe`,
    ownerKind: "parent",
    ownerId: parentAccountId,
    trialPeriodDays: existingSubscription ? undefined : PARENT_TRIAL_PERIOD_DAYS,
  });

  return session.url;
}

/**
 * Registers a new commercial API client and starts its (higher-tier) checkout. The ApiClient
 * row is created up front — `contactEmail` must be unique, so a second signup attempt with
 * the same email reuses the existing row rather than creating a duplicate — but it stays in
 * `INCOMPLETE` status, and no API key exists, until the webhook confirms payment.
 */
export async function signUpApiClient(
  env: Env,
  billingClient: StripeBillingClient | undefined,
  name: string,
  contactEmail: string,
): Promise<{ apiClientId: string; checkoutUrl: string }> {
  const client = requireClient(billingClient);
  if (!env.STRIPE_API_CLIENT_PRICE_ID) {
    throw new Error("STRIPE_API_CLIENT_PRICE_ID is not configured");
  }

  const apiClient = await prisma.apiClient.upsert({
    where: { contactEmail },
    update: { name },
    create: { name, contactEmail },
  });

  const session = await client.createCheckoutSession({
    priceId: env.STRIPE_API_CLIENT_PRICE_ID,
    customerEmail: contactEmail,
    successUrl: `${env.WEB_APP_ORIGIN}/api-access/success?apiClientId=${apiClient.id}`,
    cancelUrl: `${env.WEB_APP_ORIGIN}/api-access`,
    ownerKind: "api_client",
    ownerId: apiClient.id,
  });

  return { apiClientId: apiClient.id, checkoutUrl: session.url };
}

/** Used by the success page to show "we're activating your subscription" vs. "here's your key". */
export async function getApiClientKeyStatus(
  apiClientId: string,
): Promise<{ status: string; hasKey: boolean } | null> {
  const apiClient = await prisma.apiClient.findUnique({
    where: { id: apiClientId },
    include: { apiKeys: { where: { revokedAt: null }, take: 1 } },
  });
  if (!apiClient) return null;
  return { status: apiClient.status, hasKey: apiClient.apiKeys.length > 0 };
}

/**
 * The webhook business logic: what a verified Stripe subscription-lifecycle event means for
 * our own data. Idempotent — Stripe redelivers events, so this only ever upserts by the
 * owner's unique id, never appends.
 */
export async function applySubscriptionEvent(emailSender: EmailSender, event: SubscriptionEventPayload): Promise<void> {
  if (event.ownerKind === "parent") {
    await prisma.parentSubscription.upsert({
      where: { parentAccountId: event.ownerId },
      update: { stripeSubscriptionId: event.stripeSubscriptionId, status: event.status },
      create: {
        parentAccountId: event.ownerId,
        stripeCustomerId: event.stripeCustomerId,
        stripeSubscriptionId: event.stripeSubscriptionId,
        status: event.status,
      },
    });

    await writeAuditLog(prisma, {
      actorRole: "SYSTEM",
      action: "PARENT_SUBSCRIPTION_STATUS_CHANGED",
      targetType: "ParentSubscription",
      targetId: event.ownerId,
      metadata: { status: event.status },
    });
    return;
  }

  const apiClient = await prisma.apiClient.update({
    where: { id: event.ownerId },
    data: {
      stripeCustomerId: event.stripeCustomerId,
      stripeSubscriptionId: event.stripeSubscriptionId,
      status: event.status,
    },
    include: { apiKeys: { where: { revokedAt: null }, take: 1 } },
  });

  await writeAuditLog(prisma, {
    actorRole: "SYSTEM",
    action: "API_CLIENT_SUBSCRIPTION_STATUS_CHANGED",
    targetType: "ApiClient",
    targetId: event.ownerId,
    metadata: { status: event.status },
  });

  // Issue a key the first time this client becomes entitled, and only if it doesn't already
  // have a live one (re-activating after a lapse reuses the existing key rather than
  // silently invalidating whatever the customer already has wired into their own system).
  const entitled = event.status === "ACTIVE" || event.status === "TRIALING";
  if (entitled && apiClient.apiKeys.length === 0) {
    const { rawKey, keyPrefix, keyHash } = generateApiKey();
    await prisma.apiKey.create({ data: { apiClientId: apiClient.id, keyPrefix, keyHash } });

    await emailSender.send({
      to: apiClient.contactEmail,
      subject: "Your Family Safety Supervision Score API key",
      html: `
        <p>Your subscription is active. Here is your API key — store it securely; it will not be shown again.</p>
        <p><code>${rawKey}</code></p>
        <p>See the API documentation for how to call <code>POST /api/v1/analyze</code>.</p>
      `,
    });

    await writeAuditLog(prisma, {
      actorRole: "SYSTEM",
      action: "API_KEY_ISSUED",
      targetType: "ApiClient",
      targetId: apiClient.id,
      metadata: { keyPrefix },
    });
  }
}

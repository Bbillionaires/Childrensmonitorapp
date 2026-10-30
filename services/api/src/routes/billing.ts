import type { FastifyInstance } from "fastify";
import { prisma } from "@app/database";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import type { StripeBillingClient } from "@app/billing";
import { extractSubscriptionEvent } from "@app/billing";
import { applySubscriptionEvent, BillingNotConfiguredError, createParentCheckoutSession } from "../services/billing-service.js";
import type { EmailSender } from "../services/email.js";

/**
 * A parent starting (or resuming) their own subscription — requires a parent session, same
 * as every other parent-facing action, applied per-route here rather than via the blanket
 * `/api/parents` hook so this one stays reachable even before a subscription exists (avoiding
 * the chicken-and-egg problem requireActiveSubscription would otherwise create).
 */
export async function billingCheckoutRoutes(
  fastify: FastifyInstance,
  opts: { env: Env; billingClient: StripeBillingClient | undefined },
) {
  const { env, billingClient } = opts;

  fastify.post(
    "/checkout-session",
    { preHandler: [fastify.requireParentSession, fastify.requireCsrfHeader] },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });

      try {
        const url = await createParentCheckoutSession(env, billingClient, claims.parentAccountId, user.email);
        return reply.send({ url });
      } catch (error) {
        if (error instanceof BillingNotConfiguredError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}

/**
 * Stripe calls this directly — no parent session, no cookies, and the raw request body (not
 * Fastify's parsed JSON) is required to verify the HMAC signature, which is why this is
 * registered in its own encapsulated context with a raw-body content-type parser (see app.ts)
 * rather than alongside the JSON-parsing routes above.
 */
export async function billingWebhookRoutes(
  fastify: FastifyInstance,
  opts: { env: Env; billingClient: StripeBillingClient | undefined; emailSender: EmailSender },
) {
  const { env, billingClient, emailSender } = opts;

  fastify.post("/webhook", async (request, reply) => {
    if (!billingClient || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: "Billing is not configured" });
    }

    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return reply.code(400).send({ error: "Missing Stripe-Signature header" });
    }

    let event;
    try {
      event = billingClient.constructWebhookEvent(request.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return reply.code(400).send({ error: "Invalid webhook signature" });
    }

    const payload = extractSubscriptionEvent(event);
    if (payload) {
      await applySubscriptionEvent(emailSender, payload);
    }

    return reply.send({ received: true });
  });
}

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isSubscriptionEntitled } from "@app/billing";
import { prisma } from "@app/database";
import type { ParentSessionClaims } from "@app/types";

/**
 * Gates the actual product (children, content, playlists, discovery, scores, activity,
 * alerts, reports) behind an active parent subscription — enforced server-side, not just by
 * the web app hiding a link, the same "server decides, never the client" principle as every
 * other authorization check in this API (see ARCHITECTURE.md). `GET /api/parents/me` is
 * deliberately exempt: a parent who hasn't subscribed yet still needs to know who they are so
 * the dashboard shell can show them a "Subscribe" prompt by name, rather than erroring before
 * it can render anything at all.
 */
export default fp(async function subscriptionGatePlugin(fastify: FastifyInstance) {
  fastify.decorate(
    "requireActiveSubscription",
    async function requireActiveSubscription(request: FastifyRequest, reply: FastifyReply) {
      if (request.method === "GET" && request.url === "/api/parents/me") return;

      const claims = request.sessionClaims as ParentSessionClaims;
      const subscription = await prisma.parentSubscription.findUnique({
        where: { parentAccountId: claims.parentAccountId },
      });

      if (!subscription || !isSubscriptionEntitled(subscription.status)) {
        return reply.code(402).send({ error: "An active subscription is required", code: "SUBSCRIPTION_REQUIRED" });
      }
    },
  );
});

declare module "fastify" {
  interface FastifyInstance {
    requireActiveSubscription: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

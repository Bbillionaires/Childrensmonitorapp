import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hashApiKey } from "@app/auth";
import { isSubscriptionEntitled } from "@app/billing";
import { prisma } from "@app/database";

declare module "fastify" {
  interface FastifyRequest {
    apiClientId?: string;
    apiKeyId?: string;
  }
}

/**
 * Auth for the commercial Supervision Score API (Milestone 10) — a completely separate
 * identity space from parent/child sessions (see plugins/auth.ts). A business calls with
 * `Authorization: Bearer <raw key>`; only its SHA-256 hash is ever looked up, never the raw
 * value (see @app/auth's api-keys.ts). A valid-but-unpaid key is rejected with 402, not 401:
 * the key itself is genuine, the client just isn't currently entitled to use it.
 */
export default fp(async function apiKeyAuthPlugin(fastify: FastifyInstance) {
  fastify.decorate(
    "requireApiKey",
    async function requireApiKey(request: FastifyRequest, reply: FastifyReply) {
      const header = request.headers.authorization;
      const rawKey = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
      if (!rawKey) {
        return reply.code(401).send({ error: "Missing API key" });
      }

      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(rawKey) },
        include: { apiClient: true },
      });

      if (!apiKey || apiKey.revokedAt) {
        return reply.code(401).send({ error: "Invalid or revoked API key" });
      }

      if (!isSubscriptionEntitled(apiKey.apiClient.status)) {
        return reply.code(402).send({ error: "No active subscription for this API client" });
      }

      request.apiClientId = apiKey.apiClientId;
      request.apiKeyId = apiKey.id;

      // Best-effort — a failed write here shouldn't block the actual request.
      void prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    },
  );
});

declare module "fastify" {
  interface FastifyInstance {
    requireApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

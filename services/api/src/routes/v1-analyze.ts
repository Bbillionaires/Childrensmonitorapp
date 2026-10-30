import type { FastifyInstance } from "fastify";
import { ContentProviderNotConfiguredError } from "@app/content-providers";
import { commercialAnalyzeRequestSchema } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { analyzeContentForApiClient } from "../services/commercial-api-service.js";

const ANALYZE_RATE_LIMIT = {
  max: 100,
  timeWindow: "1 hour",
  // Keyed per API key rather than IP (the global rate-limit plugin's own default, registered
  // once in app.ts — `@fastify/rate-limit` uses fastify-plugin internally, so a *second*
  // registration of the same plugin elsewhere is a no-op, not an independent instance; a
  // per-route `config.rateLimit` override against that one instance is the supported way to
  // customize a specific route). Reads the raw Authorization header directly rather than
  // `request.apiClientId` (set later, by requireApiKey's preHandler) since this check runs
  // before any preHandler — each distinct key naturally gets its own bucket either way.
  keyGenerator: (request: { headers: { authorization?: string }; ip: string }) => {
    const header = request.headers.authorization;
    const rawKey = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    return rawKey ?? request.ip;
  },
};

export default async function v1AnalyzeRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.post("/analyze", { config: { rateLimit: ANALYZE_RATE_LIMIT } }, async (request, reply) => {
    const body = parseOrReject(commercialAnalyzeRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const result = await analyzeContentForApiClient(env, request.apiClientId!, request.apiKeyId!, body);
      return reply.send(result);
    } catch (error) {
      if (error instanceof ContentProviderNotConfiguredError) {
        return reply.code(503).send({ error: error.message });
      }
      if (error instanceof Error && /not a recognizable|not found|unavailable/i.test(error.message)) {
        return reply.code(422).send({ error: error.message });
      }
      throw error;
    }
  });
}

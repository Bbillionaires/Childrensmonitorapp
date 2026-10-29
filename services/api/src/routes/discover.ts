import type { FastifyInstance } from "fastify";
import { ContentProviderNotConfiguredError } from "@app/content-providers";
import {
  createPlaylistFromDiscoveryRequestSchema,
  discoveryDecisionRequestSchema,
  discoverySearchRequestSchema,
} from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import {
  DiscoveryNotConfiguredError,
  createPlaylistFromDiscovery,
  decideDiscoveryRecommendations,
  listSavedSearches,
  runDiscoverySearch,
} from "../services/discovery-service.js";

/**
 * Mounted under /api/parents, same guards as every other parent route. See
 * IMPLEMENTATION_PLAN.md for the OPENAI_API_KEY/ANTHROPIC_API_KEY this needs — searches
 * honestly fail with 503 (not fabricated results) when neither is configured, same pattern
 * as a YouTube submission without YOUTUBE_API_KEY.
 */
const DISCOVERY_RATE_LIMIT = { max: 10, timeWindow: "1 hour" };

export default async function discoverRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  // Unlike ordinary CRUD, every call here costs real money (an LLM call plus a 100-quota-unit
  // YouTube search) from a shared, operator-funded key — not a per-user credential — so it
  // gets its own, much stricter limit than the app-wide default. Keyed by IP (the simplest
  // option available at this hook stage, before the route's own preHandler has decoded the
  // session); a per-parent-account limit would be a reasonable follow-up once real usage
  // patterns are known.
  fastify.post(
    "/discover",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: DISCOVERY_RATE_LIMIT } },
    async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const body = parseOrReject(discoverySearchRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const result = await runDiscoverySearch(env, claims.parentAccountId, claims.userId, body.childId, body.brief);
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof DiscoveryNotConfiguredError || error instanceof ContentProviderNotConfiguredError) {
        return reply.code(503).send({ error: error.message });
      }
      if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  fastify.get("/discover", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const searches = await listSavedSearches(claims.parentAccountId);
    return reply.send({ searches });
  });

  fastify.post("/discover/decisions", { preHandler: fastify.requireCsrfHeader }, async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const body = parseOrReject(discoveryDecisionRequestSchema, request.body, reply);
    if (!body) return;

    try {
      await decideDiscoveryRecommendations(
        claims.parentAccountId,
        claims.userId,
        body.childId,
        body.recommendationIds,
        body.decision,
      );
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  fastify.post(
    "/discover/create-playlist",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(createPlaylistFromDiscoveryRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const playlist = await createPlaylistFromDiscovery(
          claims.parentAccountId,
          claims.userId,
          body.recommendationIds,
          body.title,
        );
        return reply.code(201).send({ playlist });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { listApprovedContentWithScores } from "../services/scoring-service.js";

/**
 * Mounted under /api/parents, same guard as every other parent route. Powers the
 * Supervision Scores dashboard page — see SUPERVISION_SCORE.md. Read-only: scores are
 * produced automatically at content-creation time (see scoring-service.ts), not computed
 * on request.
 */
export default async function scoresRoutes(fastify: FastifyInstance, _opts: { env: Env }) {
  fastify.get("/scores", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const items = await listApprovedContentWithScores(claims.parentAccountId);
    return reply.send({ items });
  });
}

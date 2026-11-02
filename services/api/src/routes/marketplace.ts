import type { FastifyInstance } from "fastify";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { NotFoundError } from "../lib/errors.js";
import { addCuratedPlaylistToParent, listPublishedCuratedPlaylists } from "../services/marketplace-service.js";

// Mirrors playlist-service.ts's PLAYLIST_IMPORT_RATE_LIMIT — adding a marketplace playlist
// does the same per-item scoring/submission work a normal import does.
const MARKETPLACE_ADD_RATE_LIMIT = { max: 20, timeWindow: "1 hour" };

/**
 * Mounted under /api/parents, behind the same requireParentSession + requireActiveSubscription
 * guard as routes/playlists.ts. See marketplace-service.ts for why adding a curated playlist
 * clones it into the parent's own Playlist rather than referencing the curated one directly.
 */
export default async function marketplaceRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.get("/marketplace", async (_request, reply) => {
    const playlists = await listPublishedCuratedPlaylists();
    return reply.send({ playlists });
  });

  fastify.post<{ Params: { curatedPlaylistId: string } }>(
    "/marketplace/:curatedPlaylistId/add",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: MARKETPLACE_ADD_RATE_LIMIT } },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      try {
        const playlist = await addCuratedPlaylistToParent(
          env,
          claims.userId,
          claims.parentAccountId,
          request.params.curatedPlaylistId,
        );
        return reply.code(201).send({ playlist });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

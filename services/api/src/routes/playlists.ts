import type { FastifyInstance } from "fastify";
import { ContentProviderNotConfiguredError } from "@app/content-providers";
import { playlistImportRequestSchema } from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { importPlaylist, listPlaylists, PlaylistImportError } from "../services/playlist-service.js";

// Milestone 7: a single import can newly-score dozens of distinct videos in one request, each
// potentially spending a vision-model call (see content.ts's CONTENT_SUBMIT_RATE_LIMIT for the
// same underlying cost source) — tighter than content submission since one request here does
// the work of many there.
const PLAYLIST_IMPORT_RATE_LIMIT = { max: 20, timeWindow: "1 hour" };

export default async function playlistRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.post(
    "/playlists/import",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: PLAYLIST_IMPORT_RATE_LIMIT } },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(playlistImportRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const playlist = await importPlaylist(env, claims.parentAccountId, claims.userId, body.url);
        return reply.code(201).send({ playlist });
      } catch (error) {
        if (error instanceof ContentProviderNotConfiguredError) {
          return reply.code(503).send({ error: error.message });
        }
        if (error instanceof PlaylistImportError) {
          return reply.code(422).send({ error: error.message });
        }
        if (error instanceof Error && /not a recognizable|not found|unavailable/i.test(error.message)) {
          return reply.code(422).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.get("/playlists", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const playlists = await listPlaylists(claims.parentAccountId);
    return reply.send({ playlists });
  });
}

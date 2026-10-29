import type { FastifyInstance } from "fastify";
import { ContentProviderNotConfiguredError } from "@app/content-providers";
import { playlistImportRequestSchema } from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { importPlaylist, listPlaylists, PlaylistImportError } from "../services/playlist-service.js";

export default async function playlistRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.post("/playlists/import", { preHandler: fastify.requireCsrfHeader }, async (request, reply) => {
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
  });

  fastify.get("/playlists", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const playlists = await listPlaylists(claims.parentAccountId);
    return reply.send({ playlists });
  });
}

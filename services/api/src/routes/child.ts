import type { FastifyInstance } from "fastify";
import { prisma } from "@app/database";
import { exitToParentRequestSchema, recordPlaybackProgressRequestSchema } from "@app/types";
import type { ChildSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { AuthError } from "../services/auth-service.js";
import { exitToParentSession } from "../services/child-session-service.js";
import { setSessionCookies } from "../services/session-cookies.js";
import {
  getChildLibrary,
  getChildPlaylistDetail,
  getPlaybackInfo,
  recordPlaybackProgress,
} from "../services/child-library-service.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * Mounted under /api/child, behind requireChildSession (registered by the caller). Every
 * route here is scoped to the token's own childId — see plugins/auth.ts and
 * ARCHITECTURE.md's AuthN/AuthZ model — so a child session can never reach another child's
 * data, mirroring the parent/parent isolation the Milestone 1 tests cover.
 */
export default async function childRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.get("/profile", async (request, reply) => {
    const claims = request.sessionClaims as ChildSessionClaims;
    const child = await prisma.child.findUnique({ where: { id: claims.childId } });
    if (!child) return reply.code(404).send({ error: "Profile not found" });

    return reply.send({ id: child.id, firstName: child.firstName, avatarUrl: child.avatarUrl });
  });

  fastify.post("/exit-to-parent", { preHandler: fastify.requireCsrfHeader }, async (request, reply) => {
    const claims = request.sessionClaims as ChildSessionClaims;
    const body = parseOrReject(exitToParentRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const session = await exitToParentSession(env, claims, body.pin);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.get("/library", async (request, reply) => {
    const claims = request.sessionClaims as ChildSessionClaims;
    const library = await getChildLibrary(claims.childId);
    return reply.send(library);
  });

  fastify.get<{ Params: { playlistId: string } }>(
    "/playlists/:playlistId",
    async (request, reply) => {
      const claims = request.sessionClaims as ChildSessionClaims;
      try {
        const playlist = await getChildPlaylistDetail(claims.childId, request.params.playlistId);
        return reply.send(playlist);
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.get<{ Params: { contentId: string }; Querystring: { playlistId?: string } }>(
    "/content/:contentId/play",
    async (request, reply) => {
      const claims = request.sessionClaims as ChildSessionClaims;
      try {
        const playback = await getPlaybackInfo(
          env,
          claims.childId,
          claims.deviceId,
          request.params.contentId,
          request.query.playlistId,
        );
        return reply.send(playback);
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  // POST (mutating, so CSRF-guarded like every other child route that changes state), but a
  // progress ping is routine telemetry rather than a safety-relevant decision — same looser
  // treatment as GETs, no extra rate limit beyond the global default.
  fastify.post<{ Params: { viewingHistoryId: string } }>(
    "/viewing-history/:viewingHistoryId/progress",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ChildSessionClaims;
      const body = parseOrReject(recordPlaybackProgressRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await recordPlaybackProgress(claims.childId, request.params.viewingHistoryId, body.positionSeconds);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { prisma } from "@app/database";
import {
  adminDecisionRequestSchema,
  createSubscriberRequestSchema,
  curatedPlaylistAddVideoRequestSchema,
  curatedPlaylistCreateRequestSchema,
  curatedPlaylistImportRequestSchema,
  curatedPlaylistPublishRequestSchema,
} from "@app/types";
import type { AdminSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import type { StripeBillingClient } from "@app/billing";
import { ContentProviderNotConfiguredError } from "@app/content-providers";
import { parseOrReject } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import { BillingNotConfiguredError } from "../services/billing-service.js";
import {
  AdminServiceError,
  createPaymentLink,
  createSubscriber,
  listParentChildren,
  listSubscribers,
  removePlaylistItem,
} from "../services/admin-service.js";
import { decideApproval, getChildContentQueue, type QueueFilter } from "../services/approval-service.js";
import { listPlaylists, PlaylistImportError } from "../services/playlist-service.js";
import {
  createCuratedPlaylist,
  addCuratedVideoFromUrl,
  deleteCuratedPlaylist,
  importCuratedPlaylistFromUrl,
  listCuratedPlaylists,
  removeCuratedPlaylistItem,
  setCuratedPlaylistPublished,
} from "../services/curated-playlist-service.js";
import type { EmailSender } from "../services/email.js";

const PAYMENT_LINK_RATE_LIMIT = { max: 30, timeWindow: "1 hour" };
const CURATED_IMPORT_RATE_LIMIT = { max: 20, timeWindow: "1 hour" };
const QUEUE_FILTERS: QueueFilter[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

/**
 * Mounted under /api/admin, behind requireAdminSession — a platform operator's own console,
 * never a parent/child/school session (see admin-auth-service.ts). No subscription gate:
 * admins aren't parents. Every subscriber-scoped action takes :parentAccountId from the URL
 * and the service layer re-verifies that every child/playlist/item it touches actually
 * belongs to that one account — see admin-service.ts's doc comments.
 */
export default async function adminRoutes(
  fastify: FastifyInstance,
  opts: { env: Env; billingClient: StripeBillingClient | undefined; emailSender: EmailSender },
) {
  const { env, billingClient, emailSender } = opts;

  fastify.get("/me", async (request, reply) => {
    const claims = request.sessionClaims as AdminSessionClaims;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
    return reply.send({ id: user.id, email: user.email });
  });

  fastify.get<{ Querystring: { search?: string } }>("/subscribers", async (request, reply) => {
    const subscribers = await listSubscribers(request.query.search);
    return reply.send({ subscribers });
  });

  fastify.post(
    "/subscribers",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      const body = parseOrReject(createSubscriberRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await createSubscriber(env, emailSender, claims.userId, body);
        return reply.code(201).send({ ok: true });
      } catch (error) {
        if (error instanceof AdminServiceError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.post<{ Params: { parentAccountId: string } }>(
    "/subscribers/:parentAccountId/payment-link",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: PAYMENT_LINK_RATE_LIMIT } },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      try {
        const url = await createPaymentLink(
          env,
          billingClient,
          emailSender,
          claims.userId,
          request.params.parentAccountId,
        );
        return reply.send({ url });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        if (error instanceof BillingNotConfiguredError) return reply.code(503).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.get<{ Params: { parentAccountId: string } }>(
    "/subscribers/:parentAccountId/children",
    async (request, reply) => {
      const children = await listParentChildren(request.params.parentAccountId);
      return reply.send({ children });
    },
  );

  // Reuses listPlaylists/getChildContentQueue directly — both already scoped to the given
  // parentAccountId (getChildContentQueue also re-verifies childId belongs to it), so there is
  // nothing admin-specific to add here beyond taking parentAccountId from the URL rather than
  // a session claim.
  fastify.get<{ Params: { parentAccountId: string } }>(
    "/subscribers/:parentAccountId/playlists",
    async (request, reply) => {
      const playlists = await listPlaylists(request.params.parentAccountId);
      return reply.send({ playlists });
    },
  );

  fastify.get<{ Params: { parentAccountId: string; childId: string }; Querystring: { filter?: string } }>(
    "/subscribers/:parentAccountId/children/:childId/queue",
    async (request, reply) => {
      const rawFilter = (request.query.filter ?? "ALL").toUpperCase();
      const filter = (QUEUE_FILTERS as string[]).includes(rawFilter) ? (rawFilter as QueueFilter) : "ALL";
      try {
        const items = await getChildContentQueue(request.params.parentAccountId, request.params.childId, filter);
        return reply.send({ items });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.delete<{ Params: { parentAccountId: string; playlistId: string; itemId: string } }>(
    "/subscribers/:parentAccountId/playlists/:playlistId/items/:itemId",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      try {
        await removePlaylistItem(
          claims.userId,
          request.params.parentAccountId,
          request.params.playlistId,
          request.params.itemId,
        );
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.post<{ Params: { parentAccountId: string; childId: string } }>(
    "/subscribers/:parentAccountId/children/:childId/decisions",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      const body = parseOrReject(adminDecisionRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await decideApproval(
          request.params.parentAccountId,
          claims.userId,
          request.params.childId,
          body.contentId,
          body.decision,
          body.notes,
          undefined,
          body.isLearningContent,
          body.subject,
          "ADMIN",
        );
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.get("/curated-playlists", async (_request, reply) => {
    const playlists = await listCuratedPlaylists();
    return reply.send({ playlists });
  });

  fastify.post(
    "/curated-playlists",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      const body = parseOrReject(curatedPlaylistCreateRequestSchema, request.body, reply);
      if (!body) return;

      const playlist = await createCuratedPlaylist(claims.userId, body);
      return reply.code(201).send({ playlist });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/curated-playlists/:id/import",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: CURATED_IMPORT_RATE_LIMIT } },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      const body = parseOrReject(curatedPlaylistImportRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const playlist = await importCuratedPlaylistFromUrl(env, claims.userId, request.params.id, body.url);
        return reply.code(201).send({ playlist });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        if (error instanceof PlaylistImportError) return reply.code(422).send({ error: error.message });
        if (error instanceof ContentProviderNotConfiguredError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/curated-playlists/:id/videos",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: CURATED_IMPORT_RATE_LIMIT } },
    async (request, reply) => {
      const claims = request.sessionClaims as AdminSessionClaims;
      const body = parseOrReject(curatedPlaylistAddVideoRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const playlist = await addCuratedVideoFromUrl(env, claims.userId, request.params.id, body.url);
        return reply.code(201).send({ playlist });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        if (error instanceof ContentProviderNotConfiguredError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.delete<{ Params: { id: string; itemId: string } }>(
    "/curated-playlists/:id/items/:itemId",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      try {
        await removeCuratedPlaylistItem(request.params.id, request.params.itemId);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.patch<{ Params: { id: string } }>(
    "/curated-playlists/:id/publish",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const body = parseOrReject(curatedPlaylistPublishRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const playlist = await setCuratedPlaylistPublished(request.params.id, body.published);
        return reply.send({ playlist });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/curated-playlists/:id",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      try {
        await deleteCuratedPlaylist(request.params.id);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { ContentProviderNotConfiguredError } from "@app/content-providers";
import { approvalRequestSchema, contentSubmitRequestSchema } from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import { listSubmittedContent, submitContentUrl } from "../services/content-service.js";
import { decideApproval, getChildContentQueue, type QueueFilter } from "../services/approval-service.js";

const QUEUE_FILTERS: QueueFilter[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

/**
 * Mounted under /api/parents, behind the same requireParentSession guard as
 * routes/parents.ts. Every child-scoped route re-checks that childId belongs to the calling
 * parent's own account inside the service layer (see approval-service.ts) — the same
 * ownership boundary the Milestone 1 security tests cover for child profiles.
 */
export default async function contentRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.post("/content/submit", { preHandler: fastify.requireCsrfHeader }, async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const body = parseOrReject(contentSubmitRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const content = await submitContentUrl(env, claims.parentAccountId, claims.userId, body.url);
      return reply.code(201).send({ content });
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

  fastify.get("/content", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const content = await listSubmittedContent(claims.parentAccountId);
    return reply.send({ content });
  });

  fastify.get<{ Params: { childId: string }; Querystring: { filter?: string } }>(
    "/children/:childId/queue",
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const rawFilter = (request.query.filter ?? "ALL").toUpperCase();
      const filter = (QUEUE_FILTERS as string[]).includes(rawFilter) ? (rawFilter as QueueFilter) : "ALL";

      try {
        const items = await getChildContentQueue(claims.parentAccountId, request.params.childId, filter);
        return reply.send({ items });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.post<{ Params: { childId: string } }>(
    "/children/:childId/decisions",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(approvalRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await decideApproval(
          claims.parentAccountId,
          claims.userId,
          request.params.childId,
          body.contentId,
          body.decision,
          body.notes,
        );
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { submitReportRequestSchema } from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import { listMyReports, submitReport } from "../services/parent-report-service.js";

/** Mounted under /api/parents, same guard as every other parent route. See
 * PRODUCT_REQUIREMENTS.md's "Parent reporting" section. */
export default async function reportsRoutes(fastify: FastifyInstance, _opts: { env: Env }) {
  fastify.post("/reports", { preHandler: fastify.requireCsrfHeader }, async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const body = parseOrReject(submitReportRequestSchema, request.body, reply);
    if (!body) return;

    try {
      await submitReport(claims.parentAccountId, claims.userId, body.contentId, body.childId, body.category, body.details);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  fastify.get("/reports", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const items = await listMyReports(claims.parentAccountId);
    return reply.send({ items });
  });
}

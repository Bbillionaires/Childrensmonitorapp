import type { FastifyInstance } from "fastify";
import { resolveAlertRequestSchema } from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import { listAlertsForParent, resolveAlert } from "../services/safety-alert-service.js";

/** Mounted under /api/parents, same guard as every other parent route. Powers the Safety
 * Alerts dashboard page — see PRODUCT_REQUIREMENTS.md's "Safety alerts" section. */
export default async function alertsRoutes(fastify: FastifyInstance, _opts: { env: Env }) {
  fastify.get("/alerts", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const items = await listAlertsForParent(claims.parentAccountId);
    return reply.send({ items });
  });

  fastify.post<{ Params: { alertId: string } }>(
    "/alerts/:alertId/resolve",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(resolveAlertRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await resolveAlert(claims.parentAccountId, claims.userId, request.params.alertId, body.resolution);
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

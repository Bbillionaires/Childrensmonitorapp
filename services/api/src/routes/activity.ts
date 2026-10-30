import type { FastifyInstance } from "fastify";
import type { ParentSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import { listViewingHistory } from "../services/viewing-history-service.js";

/** Mounted under /api/parents, same guard as every other parent route. Powers the Viewing
 * Activity dashboard page. */
export default async function activityRoutes(fastify: FastifyInstance, _opts: { env: Env }) {
  fastify.get("/activity", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const items = await listViewingHistory(claims.parentAccountId);
    return reply.send({ items });
  });
}

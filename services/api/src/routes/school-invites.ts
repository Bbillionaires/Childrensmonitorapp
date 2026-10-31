import type { FastifyInstance } from "fastify";
import type { ParentSessionClaims } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import {
  AlreadyOnASchoolError,
  InviteAlreadyResolvedError,
  InviteExpiredError,
  SeatLimitExceededError,
  acceptSchoolSeatInvite,
  previewSchoolSeatInvite,
} from "../services/school-service.js";

/**
 * A parent viewing/accepting a school's seat invite — requires a parent session (so we know
 * which ParentAccount to link) but deliberately NOT requireActiveSubscription: accepting an
 * invite is exactly how a parent with no subscription at all becomes entitled, so gating it
 * on "already has an active subscription" would make it uncallable for the one case it
 * exists for. Registered as its own encapsulated /api/parents instance in app.ts, outside the
 * gated one, the same pattern billingCheckoutRoutes already uses.
 */
export default async function schoolInviteRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { token: string } }>("/school-invites/:token", async (request, reply) => {
    try {
      const preview = await previewSchoolSeatInvite(request.params.token);
      return reply.send(preview);
    } catch (error) {
      if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  fastify.post<{ Params: { token: string } }>(
    "/school-invites/:token/accept",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      try {
        await acceptSchoolSeatInvite(claims.parentAccountId, request.params.token);
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        if (error instanceof InviteAlreadyResolvedError || error instanceof InviteExpiredError) {
          return reply.code(409).send({ error: error.message });
        }
        if (error instanceof AlreadyOnASchoolError) {
          return reply.code(409).send({ error: error.message });
        }
        if (error instanceof SeatLimitExceededError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}

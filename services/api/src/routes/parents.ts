import type { FastifyInstance } from "fastify";
import { prisma } from "@app/database";
import { childCreateRequestSchema, childUpdateRequestSchema, setPinRequestSchema } from "@app/types";
import type { ParentSessionClaims } from "@app/types";
import { parseOrReject } from "../lib/validate.js";
import { AuthError, setParentPin } from "../services/auth-service.js";
import {
  NotFoundError,
  archiveChild,
  createChild,
  getChild,
  listChildren,
  updateChild,
} from "../services/child-service.js";

/**
 * Every route here requires `requireParentSession` (registered by the caller) plus, for
 * anything mutating, `requireCsrfHeader`. Every :childId lookup is scoped to the caller's
 * own `parentAccountId` inside the service layer — a parent can never read or change
 * another parent's child, which is exactly the boundary the security tests in
 * services/api/src/test verify.
 */
export default async function parentRoutes(fastify: FastifyInstance) {
  fastify.get("/me", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      include: { parentAccount: true },
    });
    if (!user?.parentAccount) return reply.code(404).send({ error: "Account not found" });

    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.parentAccount.displayName,
      timezone: user.parentAccount.timezone,
      mfaEnabled: user.mfaEnabled,
      pinConfigured: Boolean(user.pinHash),
      createdAt: user.createdAt.toISOString(),
    });
  });

  fastify.post(
    "/me/pin",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(setPinRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await setParentPin(claims.userId, body.currentPassword, body.pin);
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.get("/children", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    const children = await listChildren(claims.parentAccountId);
    return reply.send({ children });
  });

  fastify.post(
    "/children",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(childCreateRequestSchema, request.body, reply);
      if (!body) return;

      const child = await createChild(claims.parentAccountId, claims.userId, body);
      return reply.code(201).send({ child });
    },
  );

  fastify.get<{ Params: { childId: string } }>("/children/:childId", async (request, reply) => {
    const claims = request.sessionClaims as ParentSessionClaims;
    try {
      const child = await getChild(claims.parentAccountId, request.params.childId);
      return reply.send({ child });
    } catch (error) {
      if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  fastify.patch<{ Params: { childId: string } }>(
    "/children/:childId",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      const body = parseOrReject(childUpdateRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const child = await updateChild(claims.parentAccountId, claims.userId, request.params.childId, body);
        return reply.send({ child });
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );

  fastify.delete<{ Params: { childId: string } }>(
    "/children/:childId",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as ParentSessionClaims;
      try {
        await archiveChild(claims.parentAccountId, claims.userId, request.params.childId);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }
    },
  );
}

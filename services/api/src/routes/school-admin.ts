import type { FastifyInstance } from "fastify";
import { prisma } from "@app/database";
import { schoolCheckoutRequestSchema, schoolSeatInviteRequestSchema } from "@app/types";
import type { SchoolAdminSessionClaims } from "@app/types";
import type { Env } from "@app/config";
import type { StripeBillingClient } from "@app/billing";
import { parseOrReject } from "../lib/validate.js";
import { BillingNotConfiguredError } from "../services/billing-service.js";
import {
  createSchoolCheckoutSession,
  getSchoolAccountSummary,
  inviteParentToSchool,
  listSchoolSeatInvites,
  SeatLimitExceededError,
} from "../services/school-service.js";
import type { EmailSender } from "../services/email.js";

const INVITE_RATE_LIMIT = { max: 30, timeWindow: "1 hour" };

/**
 * Mounted under /api/schools, behind requireSchoolAdminSession — a school admin's own
 * identity space, never a parent or child session (see school-auth-service.ts).
 */
export default async function schoolAdminRoutes(
  fastify: FastifyInstance,
  opts: { env: Env; billingClient: StripeBillingClient | undefined; emailSender: EmailSender },
) {
  const { env, billingClient, emailSender } = opts;

  fastify.get("/me", async (request, reply) => {
    const claims = request.sessionClaims as SchoolAdminSessionClaims;
    const summary = await getSchoolAccountSummary(claims.schoolAccountId);
    return reply.send(summary);
  });

  fastify.post(
    "/checkout-session",
    { preHandler: fastify.requireCsrfHeader },
    async (request, reply) => {
      const claims = request.sessionClaims as SchoolAdminSessionClaims;
      const body = parseOrReject(schoolCheckoutRequestSchema, request.body, reply);
      if (!body) return;

      const school = await prisma.schoolAccount.findUniqueOrThrow({ where: { id: claims.schoolAccountId } });

      try {
        const url = await createSchoolCheckoutSession(
          env,
          billingClient,
          claims.schoolAccountId,
          school.contactEmail,
          body.seatCount,
        );
        return reply.send({ url });
      } catch (error) {
        if (error instanceof BillingNotConfiguredError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.get("/invites", async (request, reply) => {
    const claims = request.sessionClaims as SchoolAdminSessionClaims;
    const invites = await listSchoolSeatInvites(claims.schoolAccountId);
    return reply.send({ invites });
  });

  fastify.post(
    "/invites",
    { preHandler: fastify.requireCsrfHeader, config: { rateLimit: INVITE_RATE_LIMIT } },
    async (request, reply) => {
      const claims = request.sessionClaims as SchoolAdminSessionClaims;
      const body = parseOrReject(schoolSeatInviteRequestSchema, request.body, reply);
      if (!body) return;

      try {
        await inviteParentToSchool(emailSender, env, claims.schoolAccountId, body.email);
        return reply.code(201).send({ ok: true });
      } catch (error) {
        if (error instanceof SeatLimitExceededError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}

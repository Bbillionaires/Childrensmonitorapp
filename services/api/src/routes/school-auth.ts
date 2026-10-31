import type { FastifyInstance } from "fastify";
import { schoolLoginRequestSchema, schoolRegisterRequestSchema } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import {
  SchoolAuthError,
  loginSchoolAdmin,
  refreshSchoolAdminSession,
  registerSchoolAdmin,
} from "../services/school-auth-service.js";
import { logout } from "../services/auth-service.js";
import { clearSessionCookies, setSessionCookies } from "../services/session-cookies.js";

const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

/**
 * Public — a school has no session yet. Mirrors routes/auth.ts's register/login shape exactly;
 * see school-auth-service.ts for why this is a separate, parallel flow rather than an
 * extension of the parent one (different profile type, no Device/handoff concept at all).
 */
export default async function schoolAuthRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.post("/register", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = parseOrReject(schoolRegisterRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const session = await registerSchoolAdmin(env, body);
      setSessionCookies(reply, session);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      if (error instanceof SchoolAuthError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.post("/login", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = parseOrReject(schoolLoginRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const session = await loginSchoolAdmin(env, body);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof SchoolAuthError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.post("/refresh", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const refreshToken = request.cookies.refresh_token;
    if (!refreshToken) {
      return reply.code(401).send({ error: "No refresh token present" });
    }

    try {
      const session = await refreshSchoolAdminSession(env, refreshToken);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof SchoolAuthError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.post("/logout", async (request, reply) => {
    await logout(request.cookies.refresh_token);
    clearSessionCookies(reply);
    return reply.send({ ok: true });
  });
}

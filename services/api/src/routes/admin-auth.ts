import type { FastifyInstance } from "fastify";
import { adminLoginRequestSchema } from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import { AdminAuthError, loginAdmin, refreshAdminSession } from "../services/admin-auth-service.js";
import { logout } from "../services/auth-service.js";
import { clearSessionCookies, setSessionCookies } from "../services/session-cookies.js";

const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

/**
 * Public — an admin has no session yet. No /register here (see admin-auth-service.ts) —
 * mirrors routes/school-auth.ts's login/refresh/logout shape exactly.
 */
export default async function adminAuthRoutes(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  fastify.post("/login", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = parseOrReject(adminLoginRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const session = await loginAdmin(env, body);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof AdminAuthError) {
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
      const session = await refreshAdminSession(env, refreshToken);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof AdminAuthError) {
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

import type { FastifyInstance } from "fastify";
import {
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
} from "@app/types";
import type { Env } from "@app/config";
import { parseOrReject } from "../lib/validate.js";
import {
  AuthError,
  confirmPasswordReset,
  loginParent,
  logout,
  refreshSession,
  registerParent,
  requestPasswordReset,
} from "../services/auth-service.js";
import { clearSessionCookies, setSessionCookies } from "../services/session-cookies.js";
import type { EmailSender } from "../services/email.js";

const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export default async function authRoutes(
  fastify: FastifyInstance,
  opts: { env: Env; emailSender: EmailSender },
) {
  const { env, emailSender } = opts;

  fastify.post(
    "/register",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseOrReject(registerRequestSchema, request.body, reply);
      if (!body) return;

      try {
        const session = await registerParent(env, body);
        setSessionCookies(reply, session);
        return reply.code(201).send({ ok: true });
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  fastify.post("/login", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = parseOrReject(loginRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const session = await loginParent(env, body);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof AuthError) {
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
      const session = await refreshSession(env, refreshToken);
      setSessionCookies(reply, session);
      return reply.send({ ok: true });
    } catch (error) {
      clearSessionCookies(reply);
      if (error instanceof AuthError) {
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

  fastify.post(
    "/password-reset/request",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseOrReject(passwordResetRequestSchema, request.body, reply);
      if (!body) return;

      await requestPasswordReset(emailSender, body.email);
      // Always the same response — see requestPasswordReset's anti-enumeration comment.
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    "/password-reset/confirm",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseOrReject(passwordResetConfirmSchema, request.body, reply);
      if (!body) return;

      try {
        await confirmPasswordReset(body.token, body.newPassword);
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}

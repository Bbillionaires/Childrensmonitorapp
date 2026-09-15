import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  InvalidSessionTokenError,
  assertChildSession,
  assertParentSession,
  verifyAccessToken,
} from "@app/auth";
import type { ChildSessionClaims, ParentSessionClaims, SessionClaims } from "@app/types";
import type { Env } from "@app/config";

declare module "fastify" {
  interface FastifyRequest {
    sessionClaims?: SessionClaims;
  }
}

/**
 * The single place every route relies on to read "who is calling". Access tokens travel as
 * an httpOnly cookie (immune to XSS reading it from JS) with an Authorization-header
 * fallback for non-browser clients (future native mobile/TV) — see ARCHITECTURE.md and
 * SECURITY_AND_PRIVACY.md's session-management section.
 */
export default fp(async function authPlugin(fastify: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  function extractToken(request: FastifyRequest): string | undefined {
    const cookieToken = request.cookies.access_token;
    if (cookieToken) return cookieToken;

    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
    return undefined;
  }

  function decodeSession(request: FastifyRequest): SessionClaims {
    const token = extractToken(request);
    if (!token) {
      throw new InvalidSessionTokenError("No session token provided");
    }
    return verifyAccessToken(token, { secret: env.JWT_ACCESS_SECRET });
  }

  fastify.decorate(
    "requireParentSession",
    async function requireParentSession(request: FastifyRequest, reply: FastifyReply) {
      try {
        const claims = decodeSession(request);
        assertParentSession(claims);
        request.sessionClaims = claims;
      } catch (error) {
        return reply.code(401).send({ error: (error as Error).message });
      }
    },
  );

  fastify.decorate(
    "requireChildSession",
    async function requireChildSession(request: FastifyRequest, reply: FastifyReply) {
      try {
        const claims = decodeSession(request);
        assertChildSession(claims);
        request.sessionClaims = claims;
      } catch (error) {
        return reply.code(401).send({ error: (error as Error).message });
      }
    },
  );

  /** Double-submit CSRF check for cookie-authenticated mutating requests. */
  fastify.decorate(
    "requireCsrfHeader",
    async function requireCsrfHeader(request: FastifyRequest, reply: FastifyReply) {
      // Only cookie-based sessions are CSRF-exposed; a bearer-header caller (no ambient
      // cookie) is not, so this only enforces when the access token came from a cookie.
      if (!request.cookies.access_token) return;

      const csrfCookie = request.cookies.csrf_token;
      const csrfHeader = request.headers["x-csrf-token"];
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return reply.code(403).send({ error: "Missing or invalid CSRF token" });
      }
    },
  );
});

declare module "fastify" {
  interface FastifyInstance {
    requireParentSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireChildSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireCsrfHeader: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export type { ChildSessionClaims, ParentSessionClaims };

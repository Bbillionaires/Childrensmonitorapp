import type { FastifyReply } from "fastify";
import { generateOpaqueToken } from "@app/auth";

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The web app and API are deployed on different registrable domains (e.g. a Vercel
 * app + a Railway app), making every `fetch(..., { credentials: "include" })` call
 * cross-site — a `SameSite=Lax` cookie is never attached to those, only to same-site
 * requests and top-level navigations. `SameSite=None` (which requires `Secure`) is the
 * only setting that actually works there. In development both run on `localhost`
 * (same site regardless of port), where `Lax` is the safer default.
 */
function cookieSameSite(): "lax" | "none" {
  return isProduction() ? "none" : "lax";
}

/**
 * Sessions travel as httpOnly cookies (see SECURITY_AND_PRIVACY.md) plus a readable
 * double-submit CSRF cookie the client must echo back as `X-CSRF-Token` on mutating
 * requests (checked by the `requireCsrfHeader` preHandler in plugins/auth.ts).
 */
export function setSessionCookies(
  reply: FastifyReply,
  params: { accessToken: string; refreshToken: string; refreshTokenExpiresAt: Date },
): void {
  reply.setCookie("access_token", params.accessToken, {
    httpOnly: true,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  reply.setCookie("refresh_token", params.refreshToken, {
    httpOnly: true,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    path: "/api/auth",
    expires: params.refreshTokenExpiresAt,
  });
  reply.setCookie("csrf_token", generateOpaqueToken(), {
    httpOnly: false,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    path: "/",
    expires: params.refreshTokenExpiresAt,
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie("access_token", { path: "/" });
  reply.clearCookie("refresh_token", { path: "/api/auth" });
  reply.clearCookie("csrf_token", { path: "/" });
}

/**
 * A child device-handoff session reuses the same `access_token`/`csrf_token` cookie names
 * as a parent session (disambiguated by the JWT's own `role` claim — see plugins/auth.ts),
 * so simply setting these overwrites whatever parent session cookie was there. There is no
 * child refresh token: a child has no way to silently refresh one anyway, so the session is
 * just longer-lived (see packages/auth's `expiresInSeconds`).
 *
 * Critically, this also clears any lingering parent `refresh_token` — otherwise a child
 * could call /api/auth/refresh themselves and mint a fresh *parent* access token, defeating
 * the entire point of handing off the device.
 */
export function setChildSessionCookies(
  reply: FastifyReply,
  params: { accessToken: string; expiresInSeconds: number },
): void {
  reply.setCookie("access_token", params.accessToken, {
    httpOnly: true,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    path: "/",
    maxAge: params.expiresInSeconds,
  });
  reply.setCookie("csrf_token", generateOpaqueToken(), {
    httpOnly: false,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    path: "/",
    maxAge: params.expiresInSeconds,
  });
  reply.clearCookie("refresh_token", { path: "/api/auth" });
}

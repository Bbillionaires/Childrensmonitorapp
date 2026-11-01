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
 * Host-only by default (no Domain attribute) scopes a cookie to the exact host that set it —
 * fine for the httpOnly cookies, which only need to be sent back on requests *to* the API, but
 * fatal for `csrf_token`: it's deliberately non-httpOnly so the web app's own JS can read it
 * via `document.cookie` and echo it back as `X-CSRF-Token` (the double-submit pattern), and JS
 * cookie access is scoped by the *page's* origin, not the request's. A page on `watchingwise.com`
 * can never read a cookie host-scoped to `api.watchingwise.com` — confirmed live (login/session
 * cookies worked, since those are sent automatically by the browser regardless of which page
 * triggered the request, but every CSRF-guarded POST failed with "Missing or invalid CSRF
 * token" once the web app moved to the custom domain). Setting COOKIE_DOMAIN to the shared
 * parent domain (e.g. "watchingwise.com") makes the cookie valid across every subdomain,
 * including both the web app's host and the API's — unset (the default) preserves today's
 * host-only behavior for any deployment that doesn't share a parent domain between the two.
 */
function cookieDomain(): string | undefined {
  return process.env.COOKIE_DOMAIN || undefined;
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
    domain: cookieDomain(),
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  reply.setCookie("refresh_token", params.refreshToken, {
    httpOnly: true,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    domain: cookieDomain(),
    path: "/api/auth",
    expires: params.refreshTokenExpiresAt,
  });
  reply.setCookie("csrf_token", generateOpaqueToken(), {
    httpOnly: false,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    domain: cookieDomain(),
    path: "/",
    expires: params.refreshTokenExpiresAt,
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  // A browser only deletes a cookie whose name, path, AND domain all match exactly — clearing
  // without the same domain() used to set it would silently no-op against a domain-scoped
  // cookie, leaving the old session cookie alive.
  reply.clearCookie("access_token", { path: "/", domain: cookieDomain() });
  reply.clearCookie("refresh_token", { path: "/api/auth", domain: cookieDomain() });
  reply.clearCookie("csrf_token", { path: "/", domain: cookieDomain() });
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
    domain: cookieDomain(),
    path: "/",
    maxAge: params.expiresInSeconds,
  });
  reply.setCookie("csrf_token", generateOpaqueToken(), {
    httpOnly: false,
    sameSite: cookieSameSite(),
    secure: isProduction(),
    domain: cookieDomain(),
    path: "/",
    maxAge: params.expiresInSeconds,
  });
  reply.clearCookie("refresh_token", { path: "/api/auth", domain: cookieDomain() });
}

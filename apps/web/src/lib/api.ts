const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1];
}

/**
 * access_token is deliberately short-lived (15 minutes — see session-cookies.ts) and
 * refresh_token (30 days) exists specifically so a parent/school-admin doesn't have to
 * re-login constantly, but nothing called the refresh endpoint until now: a parent who read
 * a page for a few minutes before submitting a form (e.g. importing a playlist) got a bare
 * "No session token provided" 401 with a perfectly valid refresh token sitting unused in a
 * cookie. Parents and school admins rotate against different endpoints (routes/auth.ts vs.
 * routes/school-auth.ts) because each validates the refresh token against its own account
 * type — issuing against the wrong one fails loudly (500 "Account is not fully set up")
 * rather than silently handing out the wrong role's claims, so the path prefix below is what
 * picks the right one. Child sessions (/api/child/*) have no refresh token at all (see
 * session-cookies.ts's setChildSessionCookies) — a 401 there is always just "session over."
 */
// A 401 from one of these means "wrong credentials" or "no session to act on" — not an
// expired access token on an otherwise-authenticated action — so it should surface as-is
// rather than trigger a pointless (and, for login, actively wrong) refresh-and-retry cycle.
const AUTH_BOOTSTRAP_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/schools/login",
  "/api/schools/register",
  "/api/schools/logout",
]);

function refreshEndpointFor(path: string): string | undefined {
  if (AUTH_BOOTSTRAP_PATHS.has(path)) return undefined;
  if (path.startsWith("/api/child")) return undefined;
  if (path.startsWith("/api/schools")) return "/api/schools/refresh";
  return "/api/auth/refresh";
}

// The refresh token is single-use (rotated on every call — see refreshSession in
// auth-service.ts); without this dedup, two requests that 401 at the same moment would race
// to redeem it and the loser would get "Invalid or expired session" despite the first
// refresh having succeeded. Keyed by endpoint since a given browser session only ever holds
// one role's refresh token at a time.
const inFlightRefreshes = new Map<string, Promise<boolean>>();

async function refreshSessionOnce(refreshEndpoint: string): Promise<boolean> {
  const existing = inFlightRefreshes.get(refreshEndpoint);
  if (existing) return existing;

  const attempt = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}${refreshEndpoint}`, {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    }
  })();

  inFlightRefreshes.set(refreshEndpoint, attempt);
  try {
    return await attempt;
  } finally {
    inFlightRefreshes.delete(refreshEndpoint);
  }
}

/**
 * The API's own session lives in httpOnly cookies (see services/api/src/services/
 * session-cookies.ts) — this client never reads or stores the access/refresh token itself,
 * only the readable CSRF cookie, which it must echo back on every mutating request per the
 * double-submit pattern described in SECURITY_AND_PRIVACY.md.
 */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  isRetry = false,
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (method !== "GET") {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.status === 401 && !isRetry) {
    const refreshEndpoint = refreshEndpointFor(path);
    if (refreshEndpoint && path !== refreshEndpoint) {
      const refreshed = await refreshSessionOnce(refreshEndpoint);
      if (refreshed) return apiFetch<T>(path, options, true);
    }
  }

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = (data && typeof data === "object" && "error" in data && String(data.error)) || "Request failed";
    throw new ApiError(message, response.status);
  }

  return data as T;
}

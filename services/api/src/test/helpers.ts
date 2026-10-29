import { expect } from "vitest";
import type { FastifyInstance } from "fastify";

export interface CookieJar {
  accessToken?: string;
  csrfToken?: string;
}

export function jarFromInjectResponse(cookies: Array<{ name: string; value: string }>): CookieJar {
  const jar: CookieJar = {};
  for (const cookie of cookies) {
    if (cookie.name === "access_token") jar.accessToken = cookie.value;
    if (cookie.name === "csrf_token") jar.csrfToken = cookie.value;
  }
  return jar;
}

export function cookieHeader(jar: CookieJar): string {
  return Object.entries({ access_token: jar.accessToken, csrf_token: jar.csrfToken })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function registerParent(app: FastifyInstance, email: string): Promise<CookieJar> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "Str0ngPassw0rd!", displayName: "Test Parent" },
  });
  expect(response.statusCode).toBe(201);
  return jarFromInjectResponse(response.cookies);
}

export async function createChild(app: FastifyInstance, jar: CookieJar, firstName: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/parents/children",
    headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    payload: { firstName },
  });
  expect(response.statusCode).toBe(201);
  return response.json().child.id as string;
}

export async function submitUrl(
  app: FastifyInstance,
  jar: CookieJar,
  url: string,
): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
  return app.inject({
    method: "POST",
    url: "/api/parents/content/submit",
    headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    payload: { url },
  });
}

export async function decide(
  app: FastifyInstance,
  jar: CookieJar,
  childId: string,
  contentId: string,
  decision: "APPROVED" | "REJECTED",
): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
  return app.inject({
    method: "POST",
    url: `/api/parents/children/${childId}/decisions`,
    headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    payload: { contentId, decision },
  });
}

/** Parent -> child device handoff, returning a fresh CookieJar for the child session. */
export async function startChildSession(app: FastifyInstance, parentJar: CookieJar, childId: string): Promise<CookieJar> {
  const response = await app.inject({
    method: "POST",
    url: `/api/parents/children/${childId}/device-session`,
    headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
  });
  expect(response.statusCode).toBe(200);
  return jarFromInjectResponse(response.cookies);
}

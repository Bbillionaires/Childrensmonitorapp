import { expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@app/database";

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

/**
 * Milestone 10 gates every /api/parents/* route (besides GET /me) behind an active
 * subscription — see plugins/subscription-gate.ts. Tests have no real Stripe to subscribe
 * through, so this writes a ParentSubscription row directly, the same way a webhook would
 * once Stripe confirms payment, so existing tests keep exercising the product itself rather
 * than the paywall.
 */
export async function activateParentSubscription(email: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { parentAccount: true } });
  await prisma.parentSubscription.create({
    data: {
      parentAccountId: user.parentAccount!.id,
      stripeCustomerId: `cus_test_${user.parentAccount!.id}`,
      stripeSubscriptionId: `sub_test_${user.parentAccount!.id}`,
      status: "ACTIVE",
    },
  });
}

export async function registerParent(app: FastifyInstance, email: string): Promise<CookieJar> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "Str0ngPassw0rd!", displayName: "Test Parent" },
  });
  expect(response.statusCode).toBe(201);
  await activateParentSubscription(email);
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

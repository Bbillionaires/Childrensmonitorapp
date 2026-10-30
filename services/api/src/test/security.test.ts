import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";
import { signAccessToken } from "@app/auth";
import type { ChildSessionClaims } from "@app/types";

// These must be set before @app/database (which instantiates PrismaClient at import time)
// or @app/config (which validates process.env) are ever imported — static imports below are
// hoisted by the module system, so those two are loaded dynamically, after this block runs.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };

interface CookieJar {
  accessToken?: string;
  csrfToken?: string;
  refreshToken?: string;
}

function jarFromInjectResponse(cookies: Array<{ name: string; value: string }>): CookieJar {
  const jar: CookieJar = {};
  for (const cookie of cookies) {
    if (cookie.name === "access_token") jar.accessToken = cookie.value;
    if (cookie.name === "csrf_token") jar.csrfToken = cookie.value;
    if (cookie.name === "refresh_token") jar.refreshToken = cookie.value;
  }
  return jar;
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries({
    access_token: jar.accessToken,
    csrf_token: jar.csrfToken,
    refresh_token: jar.refreshToken,
  })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function registerParent(
  app: FastifyInstance,
  overrides: { email: string; password?: string; displayName?: string },
): Promise<CookieJar> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: overrides.email,
      password: overrides.password ?? "Str0ngPassw0rd!",
      displayName: overrides.displayName ?? "Test Parent",
    },
  });
  expect(response.statusCode).toBe(201);
  // Milestone 10 gates /api/parents/* behind an active subscription — see
  // plugins/subscription-gate.ts.
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: overrides.email },
    include: { parentAccount: true },
  });
  await prisma.parentSubscription.create({
    data: {
      parentAccountId: user.parentAccount!.id,
      stripeCustomerId: `cus_test_${user.parentAccount!.id}`,
      stripeSubscriptionId: `sub_test_${user.parentAccount!.id}`,
      status: "ACTIVE",
    },
  });
  return jarFromInjectResponse(response.cookies);
}

describe("Milestone 1 security boundaries", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Cascades through ParentAccount -> Child -> everything else.
    await prisma.user.deleteMany();
  });

  it("rejects an unauthenticated request to the parent profile route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/parents/me" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects an unauthenticated request to list children", async () => {
    const response = await app.inject({ method: "GET", url: "/api/parents/children" });
    expect(response.statusCode).toBe(401);
  });

  it("never returns a password hash from the register or profile endpoints", async () => {
    const jar = await registerParent(app, { email: "hash-check@example.com" });

    const profile = await app.inject({
      method: "GET",
      url: "/api/parents/me",
      headers: { cookie: cookieHeader(jar) },
    });
    expect(profile.statusCode).toBe(200);
    const body = profile.json();
    expect(JSON.stringify(body)).not.toMatch(/passwordHash/i);
    expect(body.email).toBe("hash-check@example.com");
  });

  it("rejects a mutating request without the CSRF header even with a valid session cookie", async () => {
    const jar = await registerParent(app, { email: "csrf-check@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(jar) },
      payload: { firstName: "Kid" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("a parent can create and fetch their own child with the CSRF header present", async () => {
    const jar = await registerParent(app, { email: "owner@example.com" });

    const create = await app.inject({
      method: "POST",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
      payload: { firstName: "Alex" },
    });
    expect(create.statusCode).toBe(201);
    const childId = create.json().child.id as string;

    const get = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(jar) },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().child.firstName).toBe("Alex");
  });

  it("one parent cannot read or mutate another parent's child", async () => {
    const jarA = await registerParent(app, { email: "parent-a@example.com" });
    const jarB = await registerParent(app, { email: "parent-b@example.com" });

    const create = await app.inject({
      method: "POST",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(jarA), "x-csrf-token": jarA.csrfToken! },
      payload: { firstName: "Alex" },
    });
    const childId = create.json().child.id as string;

    const readAsB = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(jarB) },
    });
    expect(readAsB.statusCode).toBe(404);

    const updateAsB = await app.inject({
      method: "PATCH",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(jarB), "x-csrf-token": jarB.csrfToken! },
      payload: { firstName: "Hijacked" },
    });
    expect(updateAsB.statusCode).toBe(404);

    const deleteAsB = await app.inject({
      method: "DELETE",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(jarB), "x-csrf-token": jarB.csrfToken! },
    });
    expect(deleteAsB.statusCode).toBe(404);

    // The child must be untouched by parent B's attempts.
    const stillThere = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(jarA) },
    });
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json().child.firstName).toBe("Alex");
  });

  it("a child-role token is rejected on every /api/parents/* route, even via bearer header", async () => {
    const jar = await registerParent(app, { email: "parent-c@example.com" });
    const create = await app.inject({
      method: "POST",
      url: "/api/parents/children",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
      payload: { firstName: "Sam" },
    });
    const childId = create.json().child.id as string;

    const childClaims: ChildSessionClaims = {
      role: "CHILD",
      childId,
      parentAccountId: "parent_irrelevant_to_this_assertion",
      deviceId: "device_irrelevant_to_this_assertion",
    };
    const childToken = signAccessToken(childClaims, { secret: process.env.JWT_ACCESS_SECRET! });

    const response = await app.inject({
      method: "GET",
      url: "/api/parents/me",
      headers: { authorization: `Bearer ${childToken}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("issues a password reset token by email and never leaks whether an email exists", async () => {
    await registerParent(app, { email: "reset-me@example.com" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const known = await app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: "reset-me@example.com" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: "never-registered@example.com" },
    });

    expect(known.statusCode).toBe(unknown.statusCode);
    expect(known.json()).toEqual(unknown.json());

    const loggedEmail = logSpy.mock.calls.map((call) => String(call[0])).find((line) => line.includes("reset-me@example.com"));
    expect(loggedEmail).toBeDefined();
    const tokenMatch = loggedEmail!.match(/<code>([^<]+)<\/code>/);
    expect(tokenMatch).toBeTruthy();

    const confirm = await app.inject({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      payload: { token: tokenMatch![1], newPassword: "NewStr0ngPassw0rd!" },
    });
    expect(confirm.statusCode).toBe(200);

    // The old password must no longer work.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "reset-me@example.com", password: "Str0ngPassw0rd!" },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "reset-me@example.com", password: "NewStr0ngPassw0rd!" },
    });
    expect(newLogin.statusCode).toBe(200);

    logSpy.mockRestore();
  });
});

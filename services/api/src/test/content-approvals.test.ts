import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
// Deliberately left unset: proves a YouTube URL submission fails honestly (503) rather than
// being silently misfiled as a website or served fabricated metadata — see
// packages/content-providers/src/youtube-provider.ts.
delete process.env.YOUTUBE_API_KEY;

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };

interface CookieJar {
  accessToken?: string;
  csrfToken?: string;
}

function jarFromInjectResponse(cookies: Array<{ name: string; value: string }>): CookieJar {
  const jar: CookieJar = {};
  for (const cookie of cookies) {
    if (cookie.name === "access_token") jar.accessToken = cookie.value;
    if (cookie.name === "csrf_token") jar.csrfToken = cookie.value;
  }
  return jar;
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries({ access_token: jar.accessToken, csrf_token: jar.csrfToken })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function registerParent(app: FastifyInstance, email: string): Promise<CookieJar> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "Str0ngPassw0rd!", displayName: "Test Parent" },
  });
  expect(response.statusCode).toBe(201);
  // Milestone 10 gates /api/parents/* behind an active subscription — see
  // plugins/subscription-gate.ts and test/helpers.ts's activateParentSubscription.
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { parentAccount: true } });
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

async function createChild(app: FastifyInstance, jar: CookieJar, firstName: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/parents/children",
    headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    payload: { firstName },
  });
  expect(response.statusCode).toBe(201);
  return response.json().child.id as string;
}

async function submitUrl(app: FastifyInstance, jar: CookieJar, url: string) {
  return app.inject({
    method: "POST",
    url: "/api/parents/content/submit",
    headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    payload: { url },
  });
}

describe("Milestone 2: content submission and approval", () => {
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
    await prisma.user.deleteMany();
    // Content/ContentProvider rows outlive a single parent (deliberately deduplicated
    // globally — see ContentSubmission's doc comment), so each test starts from a clean
    // Content table too, not just a clean set of parents.
    await prisma.content.deleteMany();
  });

  it("submitting an unrecognized URL creates a website whitelist entry, not fabricated video metadata", async () => {
    const jar = await registerParent(app, "website-parent@example.com");

    const response = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    expect(response.statusCode).toBe(201);
    const { content } = response.json();
    expect(content.contentType).toBe("WEBSITE");
    expect(content.providerId).toBe("website");
    expect(content.title).toBe("www.example.com");

    const website = await prisma.website.findUnique({ where: { contentId: content.id } });
    expect(website?.allowedDomain).toBe("www.example.com");
  });

  it("re-submitting the same URL is idempotent and does not duplicate the submission queue", async () => {
    const jar = await registerParent(app, "dedup-parent@example.com");

    const first = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    const second = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    expect(first.json().content.id).toBe(second.json().content.id);

    const list = await app.inject({
      method: "GET",
      url: "/api/parents/content",
      headers: { cookie: cookieHeader(jar) },
    });
    expect(list.json().content).toHaveLength(1);
  });

  it("submitting a recognized YouTube URL without YOUTUBE_API_KEY fails honestly instead of faking metadata", async () => {
    const jar = await registerParent(app, "youtube-parent@example.com");

    const response = await submitUrl(app, jar, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/not configured/i);

    // Nothing should have been created for a failed submission.
    const list = await app.inject({
      method: "GET",
      url: "/api/parents/content",
      headers: { cookie: cookieHeader(jar) },
    });
    expect(list.json().content).toHaveLength(0);
  });

  it("approving content for a child grants a ChildContentPermission; rejecting revokes it", async () => {
    const jar = await registerParent(app, "approve-parent@example.com");
    const childId = await createChild(app, jar, "Alex");

    const submitted = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    const contentId = submitted.json().content.id as string;

    const pendingBefore = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childId}/queue?filter=PENDING`,
      headers: { cookie: cookieHeader(jar) },
    });
    expect(pendingBefore.json().items).toHaveLength(1);
    expect(pendingBefore.json().items[0].decision).toBeNull();

    const approve = await app.inject({
      method: "POST",
      url: `/api/parents/children/${childId}/decisions`,
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
      payload: { contentId, decision: "APPROVED" },
    });
    expect(approve.statusCode).toBe(200);

    const permission = await prisma.childContentPermission.findUnique({
      where: { childId_contentId: { childId, contentId } },
    });
    expect(permission).not.toBeNull();

    const pendingAfter = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childId}/queue?filter=PENDING`,
      headers: { cookie: cookieHeader(jar) },
    });
    expect(pendingAfter.json().items).toHaveLength(0);

    const reject = await app.inject({
      method: "POST",
      url: `/api/parents/children/${childId}/decisions`,
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
      payload: { contentId, decision: "REJECTED" },
    });
    expect(reject.statusCode).toBe(200);

    const permissionAfterReject = await prisma.childContentPermission.findUnique({
      where: { childId_contentId: { childId, contentId } },
    });
    expect(permissionAfterReject).toBeNull();
  });

  it("a parent cannot decide approvals for another parent's child, nor for content outside their own queue", async () => {
    const jarA = await registerParent(app, "parent-a@example.com");
    const jarB = await registerParent(app, "parent-b@example.com");

    const childOfA = await createChild(app, jarA, "Riley");
    const childOfB = await createChild(app, jarB, "Sam");

    const submittedByA = await submitUrl(app, jarA, "https://www.example.com/a-page");
    const contentIdFromA = submittedByA.json().content.id as string;

    // B cannot see or decide on A's child.
    const queueOnAsChildAsB = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childOfA}/queue`,
      headers: { cookie: cookieHeader(jarB) },
    });
    expect(queueOnAsChildAsB.statusCode).toBe(404);

    // B cannot approve content they never submitted, even for their own child.
    const decideForOwnChildWithForeignContent = await app.inject({
      method: "POST",
      url: `/api/parents/children/${childOfB}/decisions`,
      headers: { cookie: cookieHeader(jarB), "x-csrf-token": jarB.csrfToken! },
      payload: { contentId: contentIdFromA, decision: "APPROVED" },
    });
    expect(decideForOwnChildWithForeignContent.statusCode).toBe(404);

    const permission = await prisma.childContentPermission.findUnique({
      where: { childId_contentId: { childId: childOfB, contentId: contentIdFromA } },
    });
    expect(permission).toBeNull();
  });
});

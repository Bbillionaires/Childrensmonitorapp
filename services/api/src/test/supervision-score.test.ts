import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { ensureContentScored } = await import("../services/scoring-service.js");

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

describe("Milestone 5: Supervision Score engine", () => {
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
    // Content/ContentProvider/SafetyCategory rows outlive a single parent (global seed data —
    // see packages/database/prisma/seed.ts), so only Content needs resetting per test, same
    // as content-approvals.test.ts. Cascades away any ScoreVersion/ScoreCategoryResult too.
    await prisma.content.deleteMany();
  });

  it("scores content automatically on submission — the review queue carries a non-null supervisionScore", async () => {
    const jar = await registerParent(app, "scoring-parent@example.com");
    const submitted = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    expect(submitted.statusCode).toBe(201);

    const content = await prisma.content.findUnique({ where: { id: submitted.json().content.id } });
    const score = await prisma.supervisionScore.findUnique({ where: { contentId: content!.id } });
    expect(score).not.toBeNull();

    const queue = await app.inject({
      method: "GET",
      url: `/api/parents/children/${await createChild(app, jar, "Kid")}/queue`,
      headers: { cookie: cookieHeader(jar) },
    });
    expect(queue.json().items[0].content.supervisionScore).not.toBeNull();
    expect(queue.json().items[0].content.supervisionScore.modelVersion).toBe("rule-based-v1");
  });

  it("never re-scores already-scored content — a second submission of the same URL doesn't create a second ScoreVersion", async () => {
    const jar = await registerParent(app, "idempotent-parent@example.com");
    const first = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    const second = await submitUrl(app, jar, "https://www.example.com/kids-corner");
    expect(first.json().content.id).toBe(second.json().content.id);

    const versions = await prisma.scoreVersion.findMany({ where: { contentId: first.json().content.id } });
    expect(versions).toHaveLength(1);
  });

  it("marks down a specific category when the title/description contain a matching term, and that is reflected end-to-end", async () => {
    const content = await prisma.content.create({
      data: {
        providerId: "website",
        providerRefId: "https://www.example.com/casino-highlights",
        contentType: "WEBSITE",
        sourceUrl: "https://www.example.com/casino-highlights",
        title: "Casino slot machine big wins",
        description: "Gambling highlights for a general audience.",
        website: { create: { allowedDomain: "www.example.com" } },
      },
    });

    await ensureContentScored(content.id);

    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: { include: { categoryResults: true } } },
    });
    const gambling = score.currentScoreVersion.categoryResults.find((r) => r.safetyCategoryId === "gambling");
    expect(gambling!.score).toBeLessThan(100);
    expect(score.currentScoreVersion.overallScore).toBeLessThan(1000);
  });

  it("GET /api/parents/scores lists only this parent's approved content, each annotated with who it's approved for", async () => {
    const jarA = await registerParent(app, "scores-parent-a@example.com");
    const jarB = await registerParent(app, "scores-parent-b@example.com");
    const childA1 = await createChild(app, jarA, "Riley");
    const childA2 = await createChild(app, jarA, "Jordan");
    await createChild(app, jarB, "Sam");

    const submittedA = await submitUrl(app, jarA, "https://www.example.com/a-page");
    const contentIdA = submittedA.json().content.id as string;
    const submittedB = await submitUrl(app, jarB, "https://www.example.com/b-page");

    // Approved for both of A's children; B's own submission stays unapproved and must never
    // show up in A's list, confirming the isolation boundary this route needs same as every
    // other parent-scoped route.
    for (const childId of [childA1, childA2]) {
      const decide = await app.inject({
        method: "POST",
        url: `/api/parents/children/${childId}/decisions`,
        headers: { cookie: cookieHeader(jarA), "x-csrf-token": jarA.csrfToken! },
        payload: { contentId: contentIdA, decision: "APPROVED" },
      });
      expect(decide.statusCode).toBe(200);
    }

    const scoresForA = await app.inject({
      method: "GET",
      url: "/api/parents/scores",
      headers: { cookie: cookieHeader(jarA) },
    });
    expect(scoresForA.statusCode).toBe(200);
    const itemsA = scoresForA.json().items as Array<{
      content: { id: string; supervisionScore: unknown };
      approvedForChildren: { id: string; firstName: string }[];
    }>;
    expect(itemsA).toHaveLength(1);
    expect(itemsA[0]!.content.id).toBe(contentIdA);
    expect(itemsA[0]!.content.supervisionScore).not.toBeNull();
    expect(itemsA[0]!.approvedForChildren.map((c) => c.firstName).sort()).toEqual(["Jordan", "Riley"]);

    const scoresForB = await app.inject({
      method: "GET",
      url: "/api/parents/scores",
      headers: { cookie: cookieHeader(jarB) },
    });
    expect(scoresForB.json().items).toHaveLength(0);
    expect(submittedB.statusCode).toBe(201);
  });
});

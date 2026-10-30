import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
delete process.env.YOUTUBE_API_KEY;

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { registerParent, createChild, decide, cookieHeader } = await import("./helpers.js");
const { ensureContentScored } = await import("../services/scoring-service.js");
const { loadEnv } = await import("@app/config");
const env = loadEnv();

describe("Milestone 6: safety alerts", () => {
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
    await prisma.content.deleteMany();
  });

  it("re-scoring content whose metadata changed raises an alert for a child whose approval it affects, and the parent can resolve it", async () => {
    const parentJar = await registerParent(app, "alerts-parent@example.com");
    const childId = await createChild(app, parentJar, "AlertKid");

    const content = await prisma.content.create({
      data: {
        providerId: "website",
        providerRefId: "https://www.example.com/changing-content",
        contentType: "WEBSITE",
        sourceUrl: "https://www.example.com/changing-content",
        title: "A calm, friendly page",
        description: "Nothing concerning here.",
        website: { create: { allowedDomain: "www.example.com" } },
      },
    });
    await ensureContentScored(env, content.id);
    const initialScore = await prisma.supervisionScore.findUniqueOrThrow({ where: { contentId: content.id } });
    expect(
      (await prisma.scoreVersion.findUniqueOrThrow({ where: { id: initialScore.currentScoreVersionId } })).overallScore,
    ).toBe(1000);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "alerts-parent@example.com" } });
    const parentAccount = await prisma.parentAccount.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.contentSubmission.create({
      data: { parentAccountId: parentAccount.id, contentId: content.id, submittedByUserId: user.id },
    });
    await decide(app, parentJar, childId, content.id, "APPROVED");

    // The content's own metadata changes (the realistic Milestone 6 trigger — see
    // scoring-service.ts's doc comment) — simulating what a creator-edited title/description
    // would look like after a re-import or re-submission refreshes the stored row.
    await prisma.content.update({
      where: { id: content.id },
      data: {
        title: "dm me for more, self-harm content ahead",
        description: "hate speech, nudity and nsfw material included",
      },
    });
    await ensureContentScored(env, content.id);

    const versions = await prisma.scoreVersion.findMany({ where: { contentId: content.id }, orderBy: { analyzedAt: "asc" } });
    expect(versions).toHaveLength(2);
    expect(versions[1]!.overallScore).toBeLessThan(900);
    expect(versions[1]!.previousScoreVersionId).toBe(versions[0]!.id);

    const alertsResponse = await app.inject({
      method: "GET",
      url: "/api/parents/alerts",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(alertsResponse.statusCode).toBe(200);
    const items = alertsResponse.json().items as Array<{
      id: string;
      status: string;
      child: { firstName: string };
      previousScore: { overallScore: number } | null;
      newScore: { overallScore: number } | null;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("OPEN");
    expect(items[0]!.child.firstName).toBe("AlertKid");
    expect(items[0]!.previousScore!.overallScore).toBe(1000);
    expect(items[0]!.newScore!.overallScore).toBeLessThan(900);

    const resolve = await app.inject({
      method: "POST",
      url: `/api/parents/alerts/${items[0]!.id}/resolve`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { resolution: "REMOVED" },
    });
    expect(resolve.statusCode).toBe(200);

    const permission = await prisma.childContentPermission.findUnique({
      where: { childId_contentId: { childId, contentId: content.id } },
    });
    expect(permission).toBeNull();

    const alertAfter = await prisma.safetyAlert.findUniqueOrThrow({ where: { id: items[0]!.id } });
    expect(alertAfter.status).toBe("REMOVED");
    expect(alertAfter.resolvedAt).not.toBeNull();
  });

  it("Keep Approved leaves the ChildContentPermission in place", async () => {
    const parentJar = await registerParent(app, "keep-approved-parent@example.com");
    const childId = await createChild(app, parentJar, "KeepKid");

    const content = await prisma.content.create({
      data: {
        providerId: "website",
        providerRefId: "https://www.example.com/keep-page",
        contentType: "WEBSITE",
        sourceUrl: "https://www.example.com/keep-page",
        title: "A calm page",
        website: { create: { allowedDomain: "www.example.com" } },
      },
    });
    await ensureContentScored(env, content.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "keep-approved-parent@example.com" } });
    const parentAccount = await prisma.parentAccount.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.contentSubmission.create({
      data: { parentAccountId: parentAccount.id, contentId: content.id, submittedByUserId: user.id },
    });
    await decide(app, parentJar, childId, content.id, "APPROVED");

    await prisma.content.update({
      where: { id: content.id },
      data: { title: "suicide and extremist terrorist propaganda, racial slur content" },
    });
    await ensureContentScored(env, content.id);

    const alertsResponse = await app.inject({
      method: "GET",
      url: "/api/parents/alerts",
      headers: { cookie: cookieHeader(parentJar) },
    });
    const alertId = alertsResponse.json().items[0].id as string;

    const resolve = await app.inject({
      method: "POST",
      url: `/api/parents/alerts/${alertId}/resolve`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { resolution: "KEPT_APPROVED" },
    });
    expect(resolve.statusCode).toBe(200);

    const permission = await prisma.childContentPermission.findUnique({
      where: { childId_contentId: { childId, contentId: content.id } },
    });
    expect(permission).not.toBeNull();
  });

  it("a parent cannot resolve another parent's safety alert", async () => {
    const parentA = await registerParent(app, "alert-owner@example.com");
    const parentB = await registerParent(app, "alert-intruder@example.com");
    const childId = await createChild(app, parentA, "OwnedKid");

    const content = await prisma.content.create({
      data: {
        providerId: "website",
        providerRefId: "https://www.example.com/owned-page",
        contentType: "WEBSITE",
        sourceUrl: "https://www.example.com/owned-page",
        title: "A calm page",
        website: { create: { allowedDomain: "www.example.com" } },
      },
    });
    await ensureContentScored(env, content.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "alert-owner@example.com" } });
    const parentAccount = await prisma.parentAccount.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.contentSubmission.create({
      data: { parentAccountId: parentAccount.id, contentId: content.id, submittedByUserId: user.id },
    });
    await decide(app, parentA, childId, content.id, "APPROVED");
    await prisma.content.update({
      where: { id: content.id },
      data: { title: "dm me, self-harm, hate speech, nudity, nsfw" },
    });
    await ensureContentScored(env, content.id);

    const alertsForA = await app.inject({
      method: "GET",
      url: "/api/parents/alerts",
      headers: { cookie: cookieHeader(parentA) },
    });
    const alertId = alertsForA.json().items[0].id as string;

    const resolveAsB = await app.inject({
      method: "POST",
      url: `/api/parents/alerts/${alertId}/resolve`,
      headers: { cookie: cookieHeader(parentB), "x-csrf-token": parentB.csrfToken! },
      payload: { resolution: "REMOVED" },
    });
    expect(resolveAsB.statusCode).toBe(404);

    const alertsForB = await app.inject({
      method: "GET",
      url: "/api/parents/alerts",
      headers: { cookie: cookieHeader(parentB) },
    });
    expect(alertsForB.json().items).toHaveLength(0);
  });
});

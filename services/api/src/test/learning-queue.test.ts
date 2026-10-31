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
const { registerParent, createChild, startChildSession, cookieHeader, jarFromInjectResponse } = await import(
  "./helpers.js"
);

/**
 * Creates a piece of "content" directly via Prisma rather than through the real submit/import
 * pipeline (which needs a live YouTube key or only produces website content, which has no
 * duration — durationSeconds is required here to exercise the generic completion-percentage
 * math getPlaybackInfo/recordPlaybackProgress apply to any content type). A real
 * ContentProvider.id ("website", seeded by prisma/seed.ts) is reused since nothing here cares
 * which provider it's nominally attributed to — only the queue's content-type-agnostic
 * progress math is under test.
 */
/** Content.firstImportedByParentAccountId is a real FK to ParentAccount, not User — this
 *  looks up the right id the same way helpers.ts's activateParentSubscription does. */
async function parentAccountIdFor(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { parentAccount: true } });
  return user.parentAccount!.id;
}

async function createTestContent(parentAccountId: string, refId: string, durationSeconds = 100) {
  const content = await prisma.content.create({
    data: {
      providerId: "website",
      providerRefId: refId,
      contentType: "WEBSITE",
      sourceUrl: `https://www.example.com/${refId}`,
      title: refId,
      durationSeconds,
      firstImportedByParentAccountId: parentAccountId,
      website: { create: { allowedDomain: "www.example.com" } },
    },
  });
  await prisma.contentSubmission.create({ data: { parentAccountId, contentId: content.id } });
  return content.id;
}

async function approveWithTag(
  app: FastifyInstance,
  jar: Awaited<ReturnType<typeof registerParent>>,
  childId: string,
  contentId: string,
  isLearningContent: boolean,
) {
  const response = await app.inject({
    method: "POST",
    url: `/api/parents/children/${childId}/decisions`,
    headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.csrfToken! },
    payload: { contentId, decision: "APPROVED", isLearningContent, subject: isLearningContent ? "MATH" : undefined },
  });
  expect(response.statusCode).toBe(200);
}

async function play(app: FastifyInstance, childJar: ReturnType<typeof jarFromInjectResponse>, contentId: string) {
  return app.inject({
    method: "GET",
    url: `/api/child/content/${contentId}/play`,
    headers: { cookie: cookieHeader(childJar) },
  });
}

async function watchFully(app: FastifyInstance, childJar: ReturnType<typeof jarFromInjectResponse>, viewingHistoryId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/child/viewing-history/${viewingHistoryId}/progress`,
    headers: { cookie: cookieHeader(childJar), "x-csrf-token": childJar.csrfToken! },
    payload: { positionSeconds: 100 },
  });
  expect(response.statusCode).toBe(204);
}

describe("Milestone 11: structured learning queue", () => {
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

  it("stays off by default: GET /api/child/learning-queue reports disabled and playback is never gated", async () => {
    const parentJar = await registerParent(app, "queue-off@example.com");
    const childId = await createChild(app, parentJar, "Riley");
    const parentAccountId = await parentAccountIdFor("queue-off@example.com");
    const funId = await createTestContent(parentAccountId, "off-fun-1");
    await approveWithTag(app, parentJar, childId, funId, false);

    const childJar = await startChildSession(app, parentJar, childId);
    const status = await app.inject({
      method: "GET",
      url: "/api/child/learning-queue",
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().enabled).toBe(false);

    const playback = await play(app, childJar, funId);
    expect(playback.statusCode).toBe(200);
  });

  it("decays 3 fun -> 2 fun -> 1 fun (holding at 1) across one device session, gates fun videos when due, and resets on a new session", async () => {
    const parentJar = await registerParent(app, "queue-on@example.com");
    const childId = await createChild(app, parentJar, "Jordan");
    const parentAccountId = await parentAccountIdFor("queue-on@example.com");

    const funId = await createTestContent(parentAccountId, "on-fun-1");
    const learningId = await createTestContent(parentAccountId, "on-learning-1");
    await approveWithTag(app, parentJar, childId, funId, false);
    await approveWithTag(app, parentJar, childId, learningId, true);

    const enable = await app.inject({
      method: "PATCH",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { structuredLearningModeEnabled: true, structuredLearningGateEnforced: true },
    });
    expect(enable.statusCode).toBe(200);

    const childJar = await startChildSession(app, parentJar, childId);

    async function queueStatus() {
      const response = await app.inject({
        method: "GET",
        url: "/api/child/learning-queue",
        headers: { cookie: cookieHeader(childJar) },
      });
      return response.json();
    }

    const initial = await queueStatus();
    expect(initial).toMatchObject({ enabled: true, gateEnforced: true, phase: "FUN", funRemainingBeforeLearning: 3 });

    // Watch 3 fun videos — the decay's first quota.
    for (let i = 0; i < 3; i += 1) {
      const playback = await play(app, childJar, funId);
      expect(playback.statusCode).toBe(200);
      await watchFully(app, childJar, playback.json().viewingHistoryId);
    }

    const dueStatus = await queueStatus();
    expect(dueStatus).toMatchObject({ phase: "LEARNING_REQUIRED", funRemainingBeforeLearning: 0 });

    // Gate enforced: fun video is blocked now.
    const blocked = await play(app, childJar, funId);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe("LEARNING_VIDEO_REQUIRED");

    // The learning video itself is never blocked.
    const learningPlayback = await play(app, childJar, learningId);
    expect(learningPlayback.statusCode).toBe(200);
    await watchFully(app, childJar, learningPlayback.json().viewingHistoryId);

    // Decayed to the second step: 2 fun videos before the next learning video.
    const afterLearning = await queueStatus();
    expect(afterLearning).toMatchObject({ phase: "FUN", funRemainingBeforeLearning: 2 });

    // Drain the second step (2) and the third (1) to confirm it holds at 1 thereafter.
    for (let i = 0; i < 2; i += 1) {
      const playback = await play(app, childJar, funId);
      await watchFully(app, childJar, playback.json().viewingHistoryId);
    }
    const atSecondLearning = await queueStatus();
    expect(atSecondLearning.phase).toBe("LEARNING_REQUIRED");
    const secondLearningPlayback = await play(app, childJar, learningId);
    await watchFully(app, childJar, secondLearningPlayback.json().viewingHistoryId);
    const afterSecondLearning = await queueStatus();
    expect(afterSecondLearning.funRemainingBeforeLearning).toBe(1); // holds at the 1-for-1 floor

    // A brand-new handoff session (new Device row) restarts the decay at 3, independent of
    // the first session's progress — see learning-queue-service.ts's doc comment on why.
    const secondChildJar = await startChildSession(app, parentJar, childId);
    const secondSessionStatus = await app.inject({
      method: "GET",
      url: "/api/child/learning-queue",
      headers: { cookie: cookieHeader(secondChildJar) },
    });
    expect(secondSessionStatus.json()).toMatchObject({ phase: "FUN", funRemainingBeforeLearning: 3 });
  });

  it("does not block playback when gate enforcement is off, even while a learning video is due", async () => {
    const parentJar = await registerParent(app, "queue-soft@example.com");
    const childId = await createChild(app, parentJar, "Sam");
    const parentAccountId = await parentAccountIdFor("queue-soft@example.com");

    const funId = await createTestContent(parentAccountId, "soft-fun-1");
    const learningId = await createTestContent(parentAccountId, "soft-learning-1");
    await approveWithTag(app, parentJar, childId, funId, false);
    await approveWithTag(app, parentJar, childId, learningId, true);

    await app.inject({
      method: "PATCH",
      url: `/api/parents/children/${childId}`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { structuredLearningModeEnabled: true, structuredLearningGateEnforced: false },
    });

    const childJar = await startChildSession(app, parentJar, childId);
    for (let i = 0; i < 3; i += 1) {
      const playback = await play(app, childJar, funId);
      expect(playback.statusCode).toBe(200);
      await watchFully(app, childJar, playback.json().viewingHistoryId);
    }

    const status = await app.inject({
      method: "GET",
      url: "/api/child/learning-queue",
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(status.json().phase).toBe("LEARNING_REQUIRED");

    // Not blocked — gate is off, this is a soft suggestion only.
    const stillAllowed = await play(app, childJar, funId);
    expect(stillAllowed.statusCode).toBe(200);
  });
});

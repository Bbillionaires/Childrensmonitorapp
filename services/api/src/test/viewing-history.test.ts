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
const { registerParent, createChild, submitUrl, decide, startChildSession, cookieHeader } = await import("./helpers.js");

describe("Milestone 6: viewing history", () => {
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

  it("playing content records a device and returns a viewingHistoryId; the parent's activity timeline shows it", async () => {
    const parentJar = await registerParent(app, "activity-parent@example.com");
    const childId = await createChild(app, parentJar, "Riley");
    const submitted = await submitUrl(app, parentJar, "https://www.example.com/activity-page");
    const contentId = submitted.json().content.id as string;
    await decide(app, parentJar, childId, contentId, "APPROVED");

    const childJar = await startChildSession(app, parentJar, childId);
    const play = await app.inject({
      method: "GET",
      url: `/api/child/content/${contentId}/play`,
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(play.statusCode).toBe(200);
    const { viewingHistoryId } = play.json();
    expect(viewingHistoryId).toBeTruthy();

    const historyRow = await prisma.viewingHistory.findUnique({ where: { id: viewingHistoryId } });
    expect(historyRow?.deviceId).not.toBeNull();

    const activity = await app.inject({
      method: "GET",
      url: "/api/parents/activity",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(activity.statusCode).toBe(200);
    const items = activity.json().items as Array<{ id: string; child: { firstName: string }; deviceLabel: string | null }>;
    const item = items.find((i) => i.id === viewingHistoryId);
    expect(item).toBeTruthy();
    expect(item?.child.firstName).toBe("Riley");
    expect(item?.deviceLabel).toBe("Riley's device");
  });

  it("progress pings move durationWatchedSeconds forward monotonically and derive completionPercentage from the content's known duration", async () => {
    const parentJar = await registerParent(app, "progress-parent@example.com");
    const childId = await createChild(app, parentJar, "Jordan");
    const content = await prisma.content.create({
      data: {
        providerId: "youtube",
        providerRefId: "dQw4w9WgXcQ",
        contentType: "VIDEO",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "A video with known duration",
        durationSeconds: 100,
        video: { create: {} },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "progress-parent@example.com" } });
    const parentAccount = await prisma.parentAccount.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.contentSubmission.create({
      data: { parentAccountId: parentAccount.id, contentId: content.id, submittedByUserId: user.id },
    });
    await decide(app, parentJar, childId, content.id, "APPROVED");

    const childJar = await startChildSession(app, parentJar, childId);
    const play = await app.inject({
      method: "GET",
      url: `/api/child/content/${content.id}/play`,
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(play.statusCode).toBe(200);
    const { viewingHistoryId } = play.json();

    async function ping(positionSeconds: number) {
      return app.inject({
        method: "POST",
        url: `/api/child/viewing-history/${viewingHistoryId}/progress`,
        headers: { cookie: cookieHeader(childJar), "x-csrf-token": childJar.csrfToken! },
        payload: { positionSeconds },
      });
    }

    expect((await ping(40)).statusCode).toBe(204);
    let row = await prisma.viewingHistory.findUniqueOrThrow({ where: { id: viewingHistoryId } });
    expect(row.durationWatchedSeconds).toBe(40);
    expect(row.completionPercentage).toBe(40);

    // An out-of-order ping with a lower position never erases progress already recorded.
    expect((await ping(20)).statusCode).toBe(204);
    row = await prisma.viewingHistory.findUniqueOrThrow({ where: { id: viewingHistoryId } });
    expect(row.durationWatchedSeconds).toBe(40);

    expect((await ping(90)).statusCode).toBe(204);
    row = await prisma.viewingHistory.findUniqueOrThrow({ where: { id: viewingHistoryId } });
    expect(row.durationWatchedSeconds).toBe(90);
    expect(row.completionPercentage).toBe(90);
  });

  it("a child cannot post progress against another child's viewing history row", async () => {
    const parentJar = await registerParent(app, "cross-child-parent@example.com");
    const childA = await createChild(app, parentJar, "ChildA");
    const childB = await createChild(app, parentJar, "ChildB");
    const submitted = await submitUrl(app, parentJar, "https://www.example.com/cross-child-page");
    const contentId = submitted.json().content.id as string;
    await decide(app, parentJar, childA, contentId, "APPROVED");

    const childAJar = await startChildSession(app, parentJar, childA);
    const play = await app.inject({
      method: "GET",
      url: `/api/child/content/${contentId}/play`,
      headers: { cookie: cookieHeader(childAJar) },
    });
    const { viewingHistoryId } = play.json();

    const childBJar = await startChildSession(app, parentJar, childB);
    const forgedPing = await app.inject({
      method: "POST",
      url: `/api/child/viewing-history/${viewingHistoryId}/progress`,
      headers: { cookie: cookieHeader(childBJar), "x-csrf-token": childBJar.csrfToken! },
      payload: { positionSeconds: 50 },
    });
    expect(forgedPing.statusCode).toBe(404);
  });

  it("a parent only ever sees their own children's viewing activity", async () => {
    const parentA = await registerParent(app, "activity-isolation-a@example.com");
    const parentB = await registerParent(app, "activity-isolation-b@example.com");
    const childA = await createChild(app, parentA, "A-Kid");
    const submittedA = await submitUrl(app, parentA, "https://www.example.com/a-only-page");
    const contentIdA = submittedA.json().content.id as string;
    await decide(app, parentA, childA, contentIdA, "APPROVED");
    const childAJar = await startChildSession(app, parentA, childA);
    await app.inject({
      method: "GET",
      url: `/api/child/content/${contentIdA}/play`,
      headers: { cookie: cookieHeader(childAJar) },
    });

    const activityForB = await app.inject({
      method: "GET",
      url: "/api/parents/activity",
      headers: { cookie: cookieHeader(parentB) },
    });
    expect(activityForB.json().items).toHaveLength(0);
  });
});

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
const { registerParent, createChild, submitUrl, cookieHeader } = await import("./helpers.js");

describe("Milestone 6: parent reporting", () => {
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

  it("submitting a report persists it and it appears in the reporting parent's own list only", async () => {
    const parentA = await registerParent(app, "reporter-a@example.com");
    const parentB = await registerParent(app, "reporter-b@example.com");
    const childId = await createChild(app, parentA, "ReportedFor");
    const submitted = await submitUrl(app, parentA, "https://www.example.com/report-me");
    const contentId = submitted.json().content.id as string;

    const report = await app.inject({
      method: "POST",
      url: "/api/parents/reports",
      headers: { cookie: cookieHeader(parentA), "x-csrf-token": parentA.csrfToken! },
      payload: { contentId, childId, category: "ADVERTISING", details: "Too many ads" },
    });
    expect(report.statusCode).toBe(201);

    const listForA = await app.inject({
      method: "GET",
      url: "/api/parents/reports",
      headers: { cookie: cookieHeader(parentA) },
    });
    const itemsA = listForA.json().items as Array<{ category: string; status: string; content: { id: string } }>;
    expect(itemsA).toHaveLength(1);
    expect(itemsA[0]!.category).toBe("ADVERTISING");
    expect(itemsA[0]!.status).toBe("SUBMITTED");
    expect(itemsA[0]!.content.id).toBe(contentId);

    const listForB = await app.inject({
      method: "GET",
      url: "/api/parents/reports",
      headers: { cookie: cookieHeader(parentB) },
    });
    expect(listForB.json().items).toHaveLength(0);
  });

  it("cannot report content outside your own submission queue", async () => {
    const parentA = await registerParent(app, "report-owner@example.com");
    const parentB = await registerParent(app, "report-stranger@example.com");
    const submitted = await submitUrl(app, parentA, "https://www.example.com/not-yours");
    const contentId = submitted.json().content.id as string;

    const report = await app.inject({
      method: "POST",
      url: "/api/parents/reports",
      headers: { cookie: cookieHeader(parentB), "x-csrf-token": parentB.csrfToken! },
      payload: { contentId, category: "OTHER" },
    });
    expect(report.statusCode).toBe(404);
  });
});

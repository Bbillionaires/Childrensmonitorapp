import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
// Deliberately left unset: proves discovery search fails honestly (503) rather than
// fabricating candidates — see packages/ai/src/claude-translator.ts. Both providers must be
// unset, since OPENAI_API_KEY (not ANTHROPIC_API_KEY) is the primary as of Milestone 4's
// dual-provider follow-up.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { registerParent, createChild, submitUrl, cookieHeader } = await import("./helpers.js");

/** Simulates "a discovery search already ran" by inserting the rows runDiscoverySearch
 * would have produced, without needing a real ANTHROPIC_API_KEY — exercises the same
 * decide/create-playlist code paths those rows feed into. */
async function seedRecommendation(parentAccountId: string, contentId: string) {
  const searchRequest = await prisma.searchRequest.create({
    data: { parentAccountId, rawQuery: "test brief", structuredQuery: { topics: ["test"] } },
  });
  const recommendation = await prisma.aIRecommendation.create({
    data: { searchRequestId: searchRequest.id, contentId, matchReason: "test match", rank: 0 },
  });
  return { searchRequest, recommendation };
}

describe("Milestone 4: AI-assisted discovery", () => {
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

  it("a discovery search fails honestly (503) without ANTHROPIC_API_KEY, rather than fabricating candidates", async () => {
    const parentJar = await registerParent(app, "discover-parent@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/parents/discover",
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { brief: "educational videos about planets for my 8 year old" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/not configured/i);
  });

  it("lists saved searches with a candidate count", async () => {
    const parentJar = await registerParent(app, "saved-search-parent@example.com");
    const submitted = await submitUrl(app, parentJar, "https://www.example.com/discovery-candidate");
    const contentId = submitted.json().content.id as string;

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "saved-search-parent@example.com" } });
    const parentAccount = await prisma.parentAccount.findUniqueOrThrow({ where: { userId: user.id } });
    await seedRecommendation(parentAccount.id, contentId);

    const response = await app.inject({
      method: "GET",
      url: "/api/parents/discover",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(response.statusCode).toBe(200);
    const { searches } = response.json();
    expect(searches).toHaveLength(1);
    expect(searches[0].candidateCount).toBe(1);
    expect(searches[0].rawQuery).toBe("test brief");
  });

  it("approving a discovery recommendation grants ChildContentPermission with source AI_DISCOVERY", async () => {
    const parentJar = await registerParent(app, "approve-discovery-parent@example.com");
    const childId = await createChild(app, parentJar, "Avery");
    const submitted = await submitUrl(app, parentJar, "https://www.example.com/discovery-approve-me");
    const contentId = submitted.json().content.id as string;

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "approve-discovery-parent@example.com" } });
    const parentAccount = await prisma.parentAccount.findUniqueOrThrow({ where: { userId: user.id } });
    const { recommendation } = await seedRecommendation(parentAccount.id, contentId);

    const response = await app.inject({
      method: "POST",
      url: "/api/parents/discover/decisions",
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { recommendationIds: [recommendation.id], childId, decision: "APPROVED" },
    });
    expect(response.statusCode).toBe(200);

    const permission = await prisma.childContentPermission.findUnique({
      where: { childId_contentId: { childId, contentId } },
    });
    expect(permission).not.toBeNull();

    const approval = await prisma.parentApproval.findUnique({
      where: { childId_contentId: { childId, contentId } },
    });
    expect(approval?.source).toBe("AI_DISCOVERY");

    const updatedRecommendation = await prisma.aIRecommendation.findUnique({ where: { id: recommendation.id } });
    expect(updatedRecommendation?.parentDecision).toBe("APPROVED");
  });

  it("a parent cannot decide or create a playlist from another parent's recommendations", async () => {
    const parentAJar = await registerParent(app, "discovery-a@example.com");
    const parentBJar = await registerParent(app, "discovery-b@example.com");
    const childOfB = await createChild(app, parentBJar, "Blake");

    const submitted = await submitUrl(app, parentAJar, "https://www.example.com/a-owns-this");
    const contentId = submitted.json().content.id as string;

    const userA = await prisma.user.findUniqueOrThrow({ where: { email: "discovery-a@example.com" } });
    const parentAccountA = await prisma.parentAccount.findUniqueOrThrow({ where: { userId: userA.id } });
    const { recommendation } = await seedRecommendation(parentAccountA.id, contentId);

    const decideAsB = await app.inject({
      method: "POST",
      url: "/api/parents/discover/decisions",
      headers: { cookie: cookieHeader(parentBJar), "x-csrf-token": parentBJar.csrfToken! },
      payload: { recommendationIds: [recommendation.id], childId: childOfB, decision: "APPROVED" },
    });
    expect(decideAsB.statusCode).toBe(404);

    const createPlaylistAsB = await app.inject({
      method: "POST",
      url: "/api/parents/discover/create-playlist",
      headers: { cookie: cookieHeader(parentBJar), "x-csrf-token": parentBJar.csrfToken! },
      payload: { recommendationIds: [recommendation.id], title: "Stolen playlist" },
    });
    expect(createPlaylistAsB.statusCode).toBe(404);
  });

  it("create-playlist bundles selected recommendations into a new parent-owned playlist", async () => {
    const parentJar = await registerParent(app, "create-playlist-parent@example.com");
    const submitted = await submitUrl(app, parentJar, "https://www.example.com/playlist-candidate");
    const contentId = submitted.json().content.id as string;

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "create-playlist-parent@example.com" } });
    const parentAccount = await prisma.parentAccount.findUniqueOrThrow({ where: { userId: user.id } });
    const { recommendation } = await seedRecommendation(parentAccount.id, contentId);

    const response = await app.inject({
      method: "POST",
      url: "/api/parents/discover/create-playlist",
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { recommendationIds: [recommendation.id], title: "My new playlist" },
    });
    expect(response.statusCode).toBe(201);
    const playlistId = response.json().playlist.id as string;

    const items = await prisma.playlistItem.findMany({ where: { playlistId } });
    expect(items).toHaveLength(1);
    expect(items[0]!.contentId).toBe(contentId);
  });
});

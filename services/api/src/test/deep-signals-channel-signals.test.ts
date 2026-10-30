import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient, Prisma } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
// Set (not deleted) from this file's very first import, since getProviderRegistry() /
// YouTubeContentProvider cache their API key at first construction for this module's
// lifetime — kept in its own file so no earlier test in another file can construct that
// singleton with a different key first. See deep-signals.test.ts for the rest of Milestone 7's
// graceful-degradation coverage.
process.env.YOUTUBE_API_KEY = "test-key";
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { loadEnv } = await import("@app/config");
const { ensureContentScored } = await import("../services/scoring-service.js");

const env = loadEnv();

describe("Milestone 7: creator/channel signals", () => {
  beforeEach(async () => {
    await prisma.content.deleteMany();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches real channel signals via YOUTUBE_API_KEY and uses them to corroborate an already-triggered grooming_indicators match", async () => {
    const publishedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/watch?v=")) return { ok: true, text: async () => "<html>no captions</html>" };
      if (url.includes("/channels")) {
        return {
          ok: true,
          json: async () => ({
            items: [{ snippet: { publishedAt }, statistics: { subscriberCount: "3", videoCount: "1" } }],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = await prisma.content.create({
      data: {
        providerId: "youtube",
        providerRefId: "dQw4w9WgXcQ",
        contentType: "VIDEO",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "add me on snapchat for more",
        rawMetadata: { snippet: { channelId: "UC_test_channel" } } as Prisma.InputJsonValue,
        video: { create: {} },
      },
    });
    await ensureContentScored(env, content.id);

    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: { include: { categoryResults: true } } },
    });
    expect(score.currentScoreVersion.signalsUsed).toContain("creatorSignals");
    const grooming = score.currentScoreVersion.categoryResults.find((c) => c.safetyCategoryId === "grooming_indicators")!;
    expect(grooming.detectedFactors).toContain("Corroborated by a new or low-history channel");
  });

  it("does not corroborate for an established channel", async () => {
    const publishedAt = new Date(Date.now() - 2000 * 86_400_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/watch?v=")) return { ok: true, text: async () => "<html>no captions</html>" };
        return {
          ok: true,
          json: async () => ({
            items: [{ snippet: { publishedAt }, statistics: { subscriberCount: "500000", videoCount: "400" } }],
          }),
        };
      }),
    );

    const content = await prisma.content.create({
      data: {
        providerId: "youtube",
        providerRefId: "oHg5SJYRHA0",
        contentType: "VIDEO",
        sourceUrl: "https://www.youtube.com/watch?v=oHg5SJYRHA0",
        title: "add me on snapchat for more",
        rawMetadata: { snippet: { channelId: "UC_established" } } as Prisma.InputJsonValue,
        video: { create: {} },
      },
    });
    await ensureContentScored(env, content.id);

    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: { include: { categoryResults: true } } },
    });
    const grooming = score.currentScoreVersion.categoryResults.find((c) => c.safetyCategoryId === "grooming_indicators")!;
    expect(grooming.detectedFactors).not.toContain("Corroborated by a new or low-history channel");
  });
});

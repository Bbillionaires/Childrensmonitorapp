import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient, Prisma } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
// Deliberately unset for determinism — several tests below explicitly re-enable one via a
// per-call `env` override instead, since getProviderRegistry()/YouTubeContentProvider cache
// their API key at first construction for the lifetime of this module (see
// deep-signals-channel-signals.test.ts, split into its own file for exactly this reason).
delete process.env.YOUTUBE_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

// Controlled per-test via the mock below — keeps this file from ever hitting a real OpenAI or
// Anthropic SDK call, while still proving scoring-service actually wires a configured
// analyzer's result into the final score. Mirrors real behavior: no keys -> undefined, exactly
// like the un-mocked factory (see packages/ai/src/factory.test.ts).
let mockThumbnailFlags: string[] = [];
vi.mock("@app/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/ai")>();
  return {
    ...actual,
    createThumbnailAnalyzer: vi.fn((config: { openaiApiKey?: string; anthropicApiKey?: string }) =>
      config.openaiApiKey || config.anthropicApiKey ? { analyze: vi.fn().mockResolvedValue(mockThumbnailFlags) } : undefined,
    ),
  };
});

const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { loadEnv } = await import("@app/config");
const { ensureContentScored } = await import("../services/scoring-service.js");

const baseEnv = loadEnv();

async function createVideoContent(overrides: { title?: string; description?: string | null; rawMetadata?: unknown } = {}) {
  return prisma.content.create({
    data: {
      providerId: "youtube",
      providerRefId: "dQw4w9WgXcQ",
      contentType: "VIDEO",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: overrides.title ?? "A calm, friendly video",
      description: overrides.description ?? "Nothing concerning here.",
      rawMetadata: (overrides.rawMetadata ?? null) as Prisma.InputJsonValue,
      video: { create: {} },
    },
  });
}

function watchPageWithCaptionTrack(baseUrl: string): string {
  return `<html><script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"${baseUrl}","languageCode":"en"}]}}}};</script></html>`;
}

describe("Milestone 7: deep signals degrade gracefully", () => {
  beforeEach(async () => {
    await prisma.content.deleteMany();
    mockThumbnailFlags = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scores content normally when the transcript fetch fails entirely (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const content = await createVideoContent();

    await expect(ensureContentScored(baseEnv, content.id)).resolves.toBeUndefined();

    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: true },
    });
    expect(score.currentScoreVersion.overallScore).toBe(1000);
    expect(score.currentScoreVersion.signalsUsed).not.toContain("transcript");
  });

  it("scores content normally when the video has no channelId in its stored metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>no captions</html>" }));
    const content = await createVideoContent({ rawMetadata: null });

    await ensureContentScored(baseEnv, content.id);
    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: true },
    });
    expect(score.currentScoreVersion.signalsUsed).not.toContain("creatorSignals");
  });

  it("scores content normally when no AI provider key is configured (no thumbnail analysis)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>no captions</html>" }));
    const content = await createVideoContent();

    await ensureContentScored({ ...baseEnv, OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined }, content.id);
    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: true },
    });
    expect(score.currentScoreVersion.signalsUsed).not.toContain("thumbnailFlags");
    expect(score.currentScoreVersion.overallScore).toBe(1000);
  });

  it("fetches and uses a real transcript when available, catching risk terms absent from title/description", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/watch?v=")) return { ok: true, text: async () => watchPageWithCaptionTrack("https://example.com/captions") };
      if (url === "https://example.com/captions") {
        return { ok: true, text: async () => "<transcript><text>dm me, self-harm, hate speech, nudity, nsfw</text></transcript>" };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = await createVideoContent(); // Clean title/description.
    await ensureContentScored(baseEnv, content.id);

    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: { include: { categoryResults: true } } },
    });
    expect(score.currentScoreVersion.signalsUsed).toContain("transcript");
    expect(score.currentScoreVersion.overallScore).toBeLessThan(1000);
    const selfHarm = score.currentScoreVersion.categoryResults.find((c) => c.safetyCategoryId === "self_harm")!;
    expect(selfHarm.score).toBeLessThan(100);
  });

  it("uses a configured thumbnail analyzer's flagged categories end-to-end", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>no captions</html>" }));
    mockThumbnailFlags = ["weapons"];

    const content = await prisma.content.create({
      data: {
        providerId: "youtube",
        providerRefId: "dQw4w9WgXcQ",
        contentType: "VIDEO",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "A calm, friendly video",
        thumbnailUrl: "https://example.com/thumb.jpg",
        video: { create: {} },
      },
    });
    await ensureContentScored({ ...baseEnv, OPENAI_API_KEY: "test-key" }, content.id);

    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: { include: { categoryResults: true } } },
    });
    expect(score.currentScoreVersion.signalsUsed).toContain("thumbnailFlags");
    const weapons = score.currentScoreVersion.categoryResults.find((c) => c.safetyCategoryId === "weapons")!;
    expect(weapons.score).toBeLessThan(100);
    expect(weapons.detectedFactors).toContain("Thumbnail image analysis flagged this category");
  });

  it("extracts external links from the description and scores external_link_risk accordingly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>no captions</html>" }));
    const content = await createVideoContent({ description: "Check out https://example.com/offer and https://spam.example.com" });

    await ensureContentScored(baseEnv, content.id);
    const score = await prisma.supervisionScore.findUniqueOrThrow({
      where: { contentId: content.id },
      include: { currentScoreVersion: { include: { categoryResults: true } } },
    });
    const externalLinkRisk = score.currentScoreVersion.categoryResults.find((c) => c.safetyCategoryId === "external_link_risk")!;
    expect(externalLinkRisk.score).toBeLessThan(100);
  });
});

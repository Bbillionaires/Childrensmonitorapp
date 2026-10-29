import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentProviderNotConfiguredError,
  YouTubeContentProvider,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  parseIso8601Duration,
} from "./youtube-provider.js";

describe("extractYouTubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=5", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts the video id from %s", (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it.each([
    ["https://vimeo.com/12345", null],
    ["https://example.com/watch?v=dQw4w9WgXcQ", null],
    ["not a url", null],
    ["https://www.youtube.com/watch?v=short", null],
    ["https://www.youtube.com/", null],
  ])("returns null for %s", (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });
});

describe("extractYouTubePlaylistId", () => {
  it("extracts the list id from a playlist URL", () => {
    expect(extractYouTubePlaylistId("https://www.youtube.com/playlist?list=PL123abc")).toBe(
      "PL123abc",
    );
  });

  it("returns null when there is no list param", () => {
    expect(extractYouTubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("returns null for a non-YouTube host", () => {
    expect(extractYouTubePlaylistId("https://example.com/playlist?list=PL123abc")).toBeNull();
  });
});

describe("parseIso8601Duration", () => {
  it.each([
    ["PT1H2M3S", 3723],
    ["PT5M", 300],
    ["PT30S", 30],
    ["PT1H", 3600],
    [undefined, null],
    ["not-a-duration", null],
  ])("parses %s as %s seconds", (input, expected) => {
    expect(parseIso8601Duration(input)).toBe(expected);
  });
});

describe("YouTubeContentProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("canHandle works without an API key configured", () => {
    const provider = new YouTubeContentProvider(undefined);
    expect(provider.canHandle("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(provider.canHandle("https://vimeo.com/12345")).toBe(false);
  });

  it("canHandle also recognizes a pure playlist URL (no v= param), not just video URLs", () => {
    const provider = new YouTubeContentProvider(undefined);
    expect(provider.canHandle("https://www.youtube.com/playlist?list=PL123abc")).toBe(true);
  });

  it("throws ContentProviderNotConfiguredError instead of fabricating metadata when no key is set", async () => {
    const provider = new YouTubeContentProvider(undefined);
    await expect(provider.fetchVideoMetadata("https://youtu.be/dQw4w9WgXcQ")).rejects.toThrow(
      ContentProviderNotConfiguredError,
    );
  });

  it("maps a documented videos.list response shape into ProviderVideoMetadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "dQw4w9WgXcQ",
            snippet: {
              title: "Never Gonna Give You Up",
              description: "The official video",
              channelTitle: "Rick Astley",
              thumbnails: {
                default: { url: "https://i.ytimg.com/default.jpg" },
                high: { url: "https://i.ytimg.com/high.jpg" },
              },
            },
            contentDetails: { duration: "PT3M33S" },
            status: { madeForKids: false },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new YouTubeContentProvider("test-api-key");
    const metadata = await provider.fetchVideoMetadata("https://youtu.be/dQw4w9WgXcQ");

    expect(metadata).toMatchObject({
      providerId: "youtube",
      providerRefId: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      description: "The official video",
      thumbnailUrl: "https://i.ytimg.com/high.jpg",
      durationSeconds: 213,
      creatorName: "Rick Astley",
      providerMadeForKids: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("id=dQw4w9WgXcQ");
    expect(calledUrl).toContain("key=test-api-key");
  });

  it("throws a clear error when the video is not found or unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }),
    );
    const provider = new YouTubeContentProvider("test-api-key");
    await expect(provider.fetchVideoMetadata("https://youtu.be/dQw4w9WgXcQ")).rejects.toThrow(
      /not found|unavailable/i,
    );
  });

  it("paginates playlistItems.list before batching videos.list", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/playlistItems")) {
        if (url.includes("pageToken=page2")) {
          return {
            ok: true,
            json: async () => ({ items: [{ contentDetails: { videoId: "video2" } }] }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            items: [{ contentDetails: { videoId: "video1" } }],
            nextPageToken: "page2",
          }),
        };
      }
      if (url.includes("/videos")) {
        const ids = new URL(url).searchParams.get("id")?.split(",") ?? [];
        return {
          ok: true,
          json: async () => ({
            items: ids.map((id) => ({
              id,
              snippet: { title: `Title for ${id}`, channelTitle: "Some Channel" },
              contentDetails: { duration: "PT1M" },
              status: { madeForKids: true },
            })),
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new YouTubeContentProvider("test-api-key");
    const items = await provider.fetchPlaylistItems("https://www.youtube.com/playlist?list=PL123");

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.providerRefId)).toEqual(["video1", "video2"]);
  });

  it("getEmbedInfo returns a privacy-enhanced embed URL with related content disabled", () => {
    const provider = new YouTubeContentProvider("test-api-key");
    const embed = provider.getEmbedInfo("dQw4w9WgXcQ");
    expect(embed.embedUrl).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(embed.embedUrl).toContain("rel=0");
    expect(embed.disableRelatedContent).toBe(true);
  });

  it("searchVideos always requests safeSearch=strict and maps results to full metadata", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/search")) {
        expect(url).toContain("safeSearch=strict");
        expect(url).toContain("q=planets+gravity");
        return {
          ok: true,
          json: async () => ({ items: [{ id: { videoId: "abc12345678" } }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              id: "abc12345678",
              snippet: { title: "Planets for Kids", channelTitle: "Science Channel" },
              contentDetails: { duration: "PT10M" },
              status: { madeForKids: true },
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new YouTubeContentProvider("test-api-key");
    const results = await provider.searchVideos({ query: "planets gravity" });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ providerRefId: "abc12345678", title: "Planets for Kids" });
  });

  it("searchVideos throws ContentProviderNotConfiguredError without a key", async () => {
    const provider = new YouTubeContentProvider(undefined);
    await expect(provider.searchVideos({ query: "anything" })).rejects.toThrow(
      ContentProviderNotConfiguredError,
    );
  });

  it("fetchPlaylistMetadata maps the documented playlists.list response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [{ snippet: { title: "Dinosaurs for Kids", description: "Educational fun" } }],
        }),
      }),
    );
    const provider = new YouTubeContentProvider("test-api-key");
    const metadata = await provider.fetchPlaylistMetadata(
      "https://www.youtube.com/playlist?list=PL123abc",
    );
    expect(metadata).toEqual({ title: "Dinosaurs for Kids", description: "Educational fun" });
  });

  it("fetchPlaylistMetadata throws when the playlist is not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));
    const provider = new YouTubeContentProvider("test-api-key");
    await expect(
      provider.fetchPlaylistMetadata("https://www.youtube.com/playlist?list=PL123abc"),
    ).rejects.toThrow(/not found|unavailable/i);
  });

  it("fetchPlaylistMetadata throws ContentProviderNotConfiguredError without a key", async () => {
    const provider = new YouTubeContentProvider(undefined);
    await expect(
      provider.fetchPlaylistMetadata("https://www.youtube.com/playlist?list=PL123abc"),
    ).rejects.toThrow(ContentProviderNotConfiguredError);
  });

  it("extractPlaylistRefId works without an API key and returns null for a non-playlist URL", () => {
    const provider = new YouTubeContentProvider(undefined);
    expect(provider.extractPlaylistRefId("https://www.youtube.com/playlist?list=PL123abc")).toBe(
      "PL123abc",
    );
    expect(provider.extractPlaylistRefId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

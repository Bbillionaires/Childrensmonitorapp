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

  describe("fetchChannelSignals", () => {
    it("maps the documented channels.list response shape, computing channel age from publishedAt", async () => {
      const publishedAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [{ snippet: { publishedAt }, statistics: { subscriberCount: "150", videoCount: "3" } }],
          }),
        }),
      );
      const provider = new YouTubeContentProvider("test-api-key");
      const signals = await provider.fetchChannelSignals("UC123");
      expect(signals.channelAgeDays).toBe(10);
      expect(signals.subscriberCount).toBe(150);
      expect(signals.videoCount).toBe(3);
    });

    it("returns a null subscriberCount when the channel hides it, rather than reporting 0", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [{ snippet: {}, statistics: { hiddenSubscriberCount: true, videoCount: "3" } }],
          }),
        }),
      );
      const provider = new YouTubeContentProvider("test-api-key");
      const signals = await provider.fetchChannelSignals("UC123");
      expect(signals.subscriberCount).toBeNull();
    });

    it("throws ContentProviderNotConfiguredError without a key", async () => {
      const provider = new YouTubeContentProvider(undefined);
      await expect(provider.fetchChannelSignals("UC123")).rejects.toThrow(ContentProviderNotConfiguredError);
    });

    it("throws when the channel is not found", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));
      const provider = new YouTubeContentProvider("test-api-key");
      await expect(provider.fetchChannelSignals("UC123")).rejects.toThrow(/not found/i);
    });
  });

  describe("fetchTranscript", () => {
    function watchPageWithTracks(tracks: Array<{ baseUrl: string; languageCode: string }>): string {
      return `<html><script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":${JSON.stringify(
        tracks,
      )}}}};</script></html>`;
    }

    it("fetches and concatenates the preferred (English) track's transcript text, decoding entities", async () => {
      const html = watchPageWithTracks([
        { baseUrl: "https://example.com/captions/fr", languageCode: "fr" },
        { baseUrl: "https://example.com/captions/en", languageCode: "en" },
      ]);
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/watch?v=")) return { ok: true, text: async () => html };
        if (url === "https://example.com/captions/en") {
          return {
            ok: true,
            text: async () =>
              `<transcript><text start="0" dur="1">Hello &amp; welcome</text><text start="1" dur="1">to the show</text></transcript>`,
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = new YouTubeContentProvider("test-api-key");
      const transcript = await provider.fetchTranscript("dQw4w9WgXcQ");
      expect(transcript).toBe("Hello & welcome to the show");
    });

    it("returns null when the video has no captions, without throwing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>no captions here</html>" }));
      const provider = new YouTubeContentProvider("test-api-key");
      await expect(provider.fetchTranscript("dQw4w9WgXcQ")).resolves.toBeNull();
    });

    it("returns null (never throws) when the watch page fetch itself fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down")),
      );
      const provider = new YouTubeContentProvider("test-api-key");
      await expect(provider.fetchTranscript("dQw4w9WgXcQ")).resolves.toBeNull();
    });

    it("returns null (never throws) when the embedded caption track JSON is malformed", async () => {
      const html = `<html><script>"captionTracks":[{not valid json</script></html>`;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }));
      const provider = new YouTubeContentProvider("test-api-key");
      await expect(provider.fetchTranscript("dQw4w9WgXcQ")).resolves.toBeNull();
    });

    it("works without an API key — this is not an official-API method", async () => {
      const html = watchPageWithTracks([{ baseUrl: "https://example.com/captions/en", languageCode: "en" }]);
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/watch?v=")) return { ok: true, text: async () => html };
        return { ok: true, text: async () => `<transcript><text>fine</text></transcript>` };
      });
      vi.stubGlobal("fetch", fetchMock);
      const provider = new YouTubeContentProvider(undefined);
      await expect(provider.fetchTranscript("dQw4w9WgXcQ")).resolves.toBe("fine");
    });
  });
});

import type {
  ContentProvider,
  CreatorSignals,
  EmbedInfo,
  ProviderPlaylistMetadata,
  ProviderVideoMetadata,
  VideoSearchParams,
} from "./types.js";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** Thrown when a YouTube URL is recognized but the adapter has no API key configured. */
export class ContentProviderNotConfiguredError extends Error {
  constructor(providerId: string) {
    super(`The "${providerId}" content provider is not configured on this server yet.`);
    this.name = "ContentProviderNotConfiguredError";
  }
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return isValidVideoId(id) ? id! : null;
  }

  const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
  if (shortsMatch) {
    return isValidVideoId(shortsMatch[1]) ? shortsMatch[1]! : null;
  }

  const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
  if (embedMatch) {
    return isValidVideoId(embedMatch[1]) ? embedMatch[1]! : null;
  }

  const v = url.searchParams.get("v");
  if (v && isValidVideoId(v)) return v;

  return null;
}

export function extractYouTubePlaylistId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.searchParams.get("list");
}

function isValidVideoId(id: string | undefined): boolean {
  return Boolean(id) && /^[\w-]{11}$/.test(id!);
}

/**
 * Parses an ISO 8601 duration ("PT1H2M3S", as returned by contentDetails.duration) into
 * whole seconds. Returns null for a duration YouTube can't express this way (rare, e.g. an
 * ongoing livestream with no fixed length).
 */
export function parseIso8601Duration(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseIntOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Finds the index of the `]` matching the `[` at `openIndex`, respecting quoted strings so a
 * `]` inside a JSON string value doesn't end the scan early. Returns -1 if unbalanced. */
function findMatchingBracket(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: { duration?: string };
  status?: { madeForKids?: boolean };
}

function toProviderMetadata(item: YouTubeVideoItem): ProviderVideoMetadata {
  const thumbnails = item.snippet?.thumbnails ?? {};
  const thumbnailUrl =
    thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? null;

  return {
    providerId: "youtube",
    providerRefId: item.id,
    sourceUrl: `https://www.youtube.com/watch?v=${item.id}`,
    title: item.snippet?.title ?? "Untitled video",
    description: item.snippet?.description ?? null,
    thumbnailUrl,
    durationSeconds: parseIso8601Duration(item.contentDetails?.duration),
    creatorName: item.snippet?.channelTitle ?? null,
    providerMadeForKids: item.status?.madeForKids ?? null,
    rawMetadata: item as unknown as Record<string, unknown>,
  };
}

/**
 * Uses the official YouTube Data API v3 (no scraping) — see ARCHITECTURE.md and
 * IMPLEMENTATION_PLAN.md for the `YOUTUBE_API_KEY` credential this needs. `canHandle` works
 * without a key (pure URL recognition) so a submitted YouTube URL is never silently
 * misfiled as a generic website; `fetchVideoMetadata`/`fetchPlaylistItems` throw
 * `ContentProviderNotConfiguredError` when no key is present, rather than fabricating data.
 *
 * NOTE: the parsing logic below is unit-tested against YouTube's documented response shape
 * (see youtube-provider.test.ts) and has also been verified against the live API (fetching
 * real video metadata end-to-end through services/api, into the approval queue, and into a
 * child's approved library in a browser session) — `fetchPlaylistItems`' pagination has
 * only been exercised via its unit tests, not yet against a real multi-page playlist.
 */
export class YouTubeContentProvider implements ContentProvider {
  readonly id = "youtube";

  constructor(private readonly apiKey: string | undefined) {}

  canHandle(url: string): boolean {
    // Must recognize playlist URLs too, not just video URLs — otherwise the registry never
    // finds this adapter for a pure `/playlist?list=...` link and playlist import silently
    // falls through as "unsupported," per the registry's resolve() in registry.ts.
    return extractYouTubeVideoId(url) !== null || extractYouTubePlaylistId(url) !== null;
  }

  async fetchVideoMetadata(url: string): Promise<ProviderVideoMetadata> {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error("Not a recognizable YouTube video URL");
    }
    const [item] = await this.fetchVideosByIds([videoId]);
    if (!item) {
      throw new Error("This video was not found, or is private/unavailable");
    }
    return item;
  }

  async fetchPlaylistItems(url: string): Promise<ProviderVideoMetadata[]> {
    const playlistId = extractYouTubePlaylistId(url);
    if (!playlistId) {
      throw new Error("Not a recognizable YouTube playlist URL");
    }
    this.requireApiKey();

    const videoIds: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        part: "contentDetails",
        playlistId,
        maxResults: "50",
        key: this.apiKey!,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(`${API_BASE}/playlistItems?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`YouTube API error fetching playlist items: ${response.status}`);
      }
      const data = (await response.json()) as {
        items?: Array<{ contentDetails?: { videoId?: string } }>;
        nextPageToken?: string;
      };
      for (const item of data.items ?? []) {
        if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return this.fetchVideosByIds(videoIds);
  }

  async fetchPlaylistMetadata(url: string): Promise<ProviderPlaylistMetadata> {
    const playlistId = extractYouTubePlaylistId(url);
    if (!playlistId) {
      throw new Error("Not a recognizable YouTube playlist URL");
    }
    this.requireApiKey();

    const params = new URLSearchParams({ part: "snippet", id: playlistId, key: this.apiKey! });
    const response = await fetch(`${API_BASE}/playlists?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`YouTube API error fetching playlist metadata: ${response.status}`);
    }
    const data = (await response.json()) as {
      items?: Array<{ snippet?: { title?: string; description?: string } }>;
    };
    const item = data.items?.[0];
    if (!item) {
      throw new Error("This playlist was not found, or is private/unavailable");
    }
    return {
      title: item.snippet?.title ?? "Imported playlist",
      description: item.snippet?.description ?? null,
    };
  }

  getEmbedInfo(providerRefId: string): EmbedInfo {
    return {
      // youtube-nocookie.com is YouTube's own privacy-enhanced embed domain; rel=0 restricts
      // "related videos" to the same channel rather than eliminating them outright (YouTube
      // changed rel's behavior in 2018) — the child client's own wrapper must still never
      // expose search, comments, or a route to any other unapproved content.
      embedUrl: `https://www.youtube-nocookie.com/embed/${providerRefId}?rel=0&modestbranding=1`,
      disableRelatedContent: true,
    };
  }

  extractPlaylistRefId(url: string): string | null {
    return extractYouTubePlaylistId(url);
  }

  async searchVideos(params: VideoSearchParams): Promise<ProviderVideoMetadata[]> {
    this.requireApiKey();

    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: params.query,
      maxResults: String(params.maxResults ?? 12),
      // Always strict for a children's content discovery feature — this is a defense-in-depth
      // input filter, never a substitute for the Supervision Score review a parent still does
      // before anything reaches a child (see SUPERVISION_SCORE.md).
      safeSearch: "strict",
      key: this.apiKey!,
    });

    const response = await fetch(`${API_BASE}/search?${searchParams.toString()}`);
    if (!response.ok) {
      throw new Error(`YouTube API error searching videos: ${response.status}`);
    }
    const data = (await response.json()) as {
      items?: Array<{ id?: { videoId?: string } }>;
    };
    const videoIds = (data.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    return this.fetchVideosByIds(videoIds);
  }

  /** Official, API-key-only channel stats — see CreatorSignals' doc comment. */
  async fetchChannelSignals(channelId: string): Promise<CreatorSignals> {
    this.requireApiKey();

    const params = new URLSearchParams({ part: "snippet,statistics", id: channelId, key: this.apiKey! });
    const response = await fetch(`${API_BASE}/channels?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`YouTube API error fetching channel signals: ${response.status}`);
    }
    const data = (await response.json()) as {
      items?: Array<{
        snippet?: { publishedAt?: string };
        statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
      }>;
    };
    const item = data.items?.[0];
    if (!item) throw new Error("Channel not found");

    const publishedAt = item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null;
    return {
      channelAgeDays: publishedAt ? Math.floor((Date.now() - publishedAt.getTime()) / 86_400_000) : null,
      subscriberCount: item.statistics?.hiddenSubscriberCount ? null : parseIntOrNull(item.statistics?.subscriberCount),
      videoCount: parseIntOrNull(item.statistics?.videoCount),
    };
  }

  /**
   * The one deliberate exception to "official API only" in this codebase — see
   * ARCHITECTURE.md and IMPLEMENTATION_PLAN.md for why: YouTube's Data API only allows
   * downloading a caption track under OAuth consent from the video's own owner, which doesn't
   * scale to arbitrary third-party videos. This instead reads the caption track list YouTube's
   * own web player embeds in the public watch page (the same data the player itself uses,
   * fetched the same way any browser would — no video/audio download, no authentication
   * bypass), then fetches the chosen track's own timed-text URL. It is not a documented or
   * supported API and could break or be blocked without notice.
   *
   * MUST NEVER THROW: every failure mode (no captions available, network error, YouTube
   * changing its page structure) resolves to `null` so a transcript is simply absent from
   * scoring rather than breaking it — see SupervisionScorer's "degrade gracefully" contract.
   */
  async fetchTranscript(videoId: string): Promise<string | null> {
    try {
      const watchResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      if (!watchResponse.ok) return null;
      const html = await watchResponse.text();

      const marker = '"captionTracks":';
      const markerIndex = html.indexOf(marker);
      if (markerIndex === -1) return null; // No captions available for this video.

      const arrayStart = html.indexOf("[", markerIndex);
      const arrayEnd = findMatchingBracket(html, arrayStart);
      if (arrayStart === -1 || arrayEnd === -1) return null;

      const tracks = JSON.parse(html.slice(arrayStart, arrayEnd + 1)) as Array<{
        baseUrl?: string;
        languageCode?: string;
      }>;
      const track = tracks.find((t) => t.languageCode === "en") ?? tracks[0];
      if (!track?.baseUrl) return null;

      const transcriptResponse = await fetch(track.baseUrl);
      if (!transcriptResponse.ok) return null;
      const xml = await transcriptResponse.text();

      const transcript = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
        .map((match) => decodeHtmlEntities(match[1] ?? ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return transcript.length > 0 ? transcript : null;
    } catch {
      return null;
    }
  }

  private requireApiKey(): void {
    if (!this.apiKey) {
      throw new ContentProviderNotConfiguredError(this.id);
    }
  }

  private async fetchVideosByIds(videoIds: string[]): Promise<ProviderVideoMetadata[]> {
    if (videoIds.length === 0) return [];
    this.requireApiKey();

    const results: ProviderVideoMetadata[] = [];
    // The videos.list endpoint accepts at most 50 ids per call.
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const params = new URLSearchParams({
        part: "snippet,contentDetails,status",
        id: batch.join(","),
        key: this.apiKey!,
      });
      const response = await fetch(`${API_BASE}/videos?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`YouTube API error fetching video metadata: ${response.status}`);
      }
      const data = (await response.json()) as { items?: YouTubeVideoItem[] };
      for (const item of data.items ?? []) {
        results.push(toProviderMetadata(item));
      }
    }
    return results;
  }
}

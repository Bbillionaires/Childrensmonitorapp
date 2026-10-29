import type { ContentProvider, EmbedInfo, ProviderPlaylistMetadata, ProviderVideoMetadata } from "./types.js";

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

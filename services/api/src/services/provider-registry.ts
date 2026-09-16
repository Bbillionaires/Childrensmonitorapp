import { ContentProviderRegistry, YouTubeContentProvider } from "@app/content-providers";
import type { Env } from "@app/config";

let cached: ContentProviderRegistry | undefined;

/**
 * One process-wide registry. YouTubeContentProvider is always registered — canHandle()
 * needs no API key — so a YouTube URL is always recognized as one, even when
 * YOUTUBE_API_KEY is unset; fetching metadata for it then fails with a clear
 * ContentProviderNotConfiguredError instead of being silently misfiled as a website.
 */
export function getProviderRegistry(env: Env): ContentProviderRegistry {
  if (cached) return cached;
  cached = new ContentProviderRegistry();
  cached.register(new YouTubeContentProvider(env.YOUTUBE_API_KEY));
  return cached;
}

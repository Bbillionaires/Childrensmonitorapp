import type { ContentProvider } from "./types.js";

/**
 * Resolves a submitted URL to the adapter that should handle it. Empty until Milestone 2
 * registers real adapters (e.g. a `YouTubeContentProvider`) — deliberately not populated
 * with a mock adapter here, since a mock would silently pretend to import real content.
 */
export class ContentProviderRegistry {
  private readonly providers: ContentProvider[] = [];

  register(provider: ContentProvider): void {
    this.providers.push(provider);
  }

  resolve(url: string): ContentProvider | undefined {
    return this.providers.find((provider) => provider.canHandle(url));
  }

  /** Looks up a registered adapter by its own id (e.g. "youtube") rather than by URL — used
   * where there's no URL to resolve from, like AI-discovery search. */
  getById(id: string): ContentProvider | undefined {
    return this.providers.find((provider) => provider.id === id);
  }
}

export type ProviderContentType = "VIDEO" | "WEBSITE";

export interface ProviderVideoMetadata {
  providerId: string; // e.g. "youtube"
  providerRefId: string; // the provider's own id for this video
  sourceUrl: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  creatorName: string | null;
  /**
   * One input signal to the Supervision Score, never the score itself and never treated as
   * a safety guarantee — see SUPERVISION_SCORE.md.
   */
  providerMadeForKids: boolean | null;
  rawMetadata: Record<string, unknown>;
}

export interface EmbedInfo {
  /** How the child client should render playback — an iframe src, a native player config, etc. */
  embedUrl: string;
  /**
   * Provider-specific flags the child client must apply, e.g. YouTube's privacy-enhanced
   * mode and disabling related-video suggestions — see ARCHITECTURE.md's note on why the
   * "no unapproved recommendations" rule is enforced through embed parameters, not by
   * reskinning a third-party player.
   */
  disableRelatedContent: boolean;
}

export interface ProviderPlaylistMetadata {
  title: string;
  description: string | null;
}

export interface VideoSearchParams {
  /** Free-text query — typically the topics from a translated DiscoveryQuery, joined. */
  query: string;
  maxResults?: number;
}

/**
 * Implemented once per content source. `services/api` is the only caller — a provider
 * adapter must never be imported by a client app, since only the API is allowed to hold
 * the provider's API key (see SECURITY_AND_PRIVACY.md's secrets-handling section).
 */
export interface ContentProvider {
  readonly id: string;
  canHandle(url: string): boolean;
  fetchVideoMetadata(url: string): Promise<ProviderVideoMetadata>;
  fetchPlaylistItems(url: string): Promise<ProviderVideoMetadata[]>;
  getEmbedInfo(providerRefId: string): EmbedInfo;
  /** Optional — not every provider has a separate "playlist" concept (e.g. a website). */
  fetchPlaylistMetadata?(url: string): Promise<ProviderPlaylistMetadata>;
  /**
   * Extracts the provider's own stable playlist identifier from a URL (e.g. YouTube's
   * `list=` param), or null if the URL isn't a recognizable playlist URL. Used to dedupe a
   * re-imported playlist to the same row rather than creating a duplicate — see
   * DATABASE_SCHEMA.md's note on Playlist uniqueness.
   */
  extractPlaylistRefId?(url: string): string | null;
  /**
   * Optional — not every provider exposes search (a website "provider" doesn't). Powers
   * Milestone 4's AI-assisted discovery: a DiscoveryQuery's topics become a search string
   * here, never a literal scrape of search results.
   */
  searchVideos?(params: VideoSearchParams): Promise<ProviderVideoMetadata[]>;
}

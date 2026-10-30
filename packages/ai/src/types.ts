export interface DiscoveryQuery {
  topics: string[];
  targetAgeRange?: string;
  maxDurationSeconds?: number;
  excludedThemes: string[];
  minSupervisionScore?: number;
}

export interface DiscoveryContext {
  childAgeRange?: string;
  childInterests?: string[];
}

/**
 * `services/api` is the only caller. Never called from a client app directly, both because
 * the API key must stay server-side (see SECURITY_AND_PRIVACY.md) and because every
 * candidate result must be attached to a `SearchRequest` row for audit purposes before a
 * parent ever sees it (see DATABASE_SCHEMA.md's Discovery domain).
 */
export interface DiscoveryTranslator {
  translate(brief: string, context: DiscoveryContext): Promise<DiscoveryQuery>;
}

/**
 * Classifies a thumbnail image against the fixed safety-category vocabulary — one additional
 * `ScoringInput` producer for `packages/supervision-score`, same "never the verdict itself,
 * just one input" treatment as every other signal (see SUPERVISION_SCORE.md). `services/api`
 * is the only caller.
 */
export interface ThumbnailAnalyzer {
  /** `imageUrl` is the provider's own public thumbnail URL — never a scraped or re-hosted
   * image. Returns the (possibly empty) list of safety categories visibly depicted. */
  analyze(imageUrl: string): Promise<string[]>;
}

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

import type { DiscoveryContext, DiscoveryQuery, DiscoveryTranslator } from "./types.js";

/**
 * Tries `primary` first; if it throws for any reason (network error, rate limit, malformed
 * output) and a `fallback` is configured, retries once against `fallback` before giving up.
 * This is the "Claude as backup for things ChatGPT gets stuck on" architecture: cost-optimize
 * the common case, spend more only when the cheap path actually fails.
 */
export class FallbackDiscoveryTranslator implements DiscoveryTranslator {
  constructor(
    private readonly primary: DiscoveryTranslator,
    private readonly fallback: DiscoveryTranslator | undefined,
  ) {}

  async translate(brief: string, context: DiscoveryContext): Promise<DiscoveryQuery> {
    try {
      return await this.primary.translate(brief, context);
    } catch (primaryError) {
      if (!this.fallback) throw primaryError;

      try {
        return await this.fallback.translate(brief, context);
      } catch (fallbackError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `Both AI providers failed to translate this request. Primary: ${primaryMessage}. Fallback: ${fallbackMessage}.`,
        );
      }
    }
  }
}

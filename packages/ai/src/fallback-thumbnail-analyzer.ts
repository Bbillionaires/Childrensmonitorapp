import type { ThumbnailAnalyzer } from "./types.js";

/** Same try-primary-then-fallback shape as FallbackDiscoveryTranslator. */
export class FallbackThumbnailAnalyzer implements ThumbnailAnalyzer {
  constructor(
    private readonly primary: ThumbnailAnalyzer,
    private readonly fallback: ThumbnailAnalyzer | undefined,
  ) {}

  async analyze(imageUrl: string): Promise<string[]> {
    try {
      return await this.primary.analyze(imageUrl);
    } catch (primaryError) {
      if (!this.fallback) throw primaryError;

      try {
        return await this.fallback.analyze(imageUrl);
      } catch (fallbackError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `Both AI providers failed to analyze this thumbnail. Primary: ${primaryMessage}. Fallback: ${fallbackMessage}.`,
        );
      }
    }
  }
}

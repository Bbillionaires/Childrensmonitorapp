import type { DiscoveryTranslator, ThumbnailAnalyzer } from "./types.js";
import { ClaudeDiscoveryTranslator } from "./claude-translator.js";
import { OpenAIDiscoveryTranslator } from "./openai-translator.js";
import { FallbackDiscoveryTranslator } from "./fallback-translator.js";
import { ClaudeThumbnailAnalyzer } from "./claude-thumbnail-analyzer.js";
import { OpenAIThumbnailAnalyzer } from "./openai-thumbnail-analyzer.js";
import { FallbackThumbnailAnalyzer } from "./fallback-thumbnail-analyzer.js";

export interface DiscoveryTranslatorConfig {
  /** Primary provider — cost-optimized, since this runs from a shared operator-funded key. */
  openaiApiKey?: string;
  openaiModel?: string;
  /** Fallback provider, used only when the primary fails. Either key alone still works. */
  anthropicApiKey?: string;
}

/**
 * Builds whichever `DiscoveryTranslator` the available credentials support:
 * - both keys  → OpenAI primary, Claude fallback
 * - only one   → that provider alone, no fallback
 * - neither    → `undefined`, so the caller fails honestly (503) rather than fabricating a
 *   translation — see discovery-service.ts.
 */
export function createDiscoveryTranslator(config: DiscoveryTranslatorConfig): DiscoveryTranslator | undefined {
  const openai = config.openaiApiKey
    ? new OpenAIDiscoveryTranslator(config.openaiApiKey, config.openaiModel)
    : undefined;
  const claude = config.anthropicApiKey ? new ClaudeDiscoveryTranslator(config.anthropicApiKey) : undefined;

  if (openai && claude) return new FallbackDiscoveryTranslator(openai, claude);
  return openai ?? claude;
}

export interface ThumbnailAnalyzerConfig {
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
}

/**
 * Same shape as `createDiscoveryTranslator`: both keys → OpenAI primary/Claude fallback, one
 * key → that provider alone, neither → `undefined` (scoring simply skips thumbnail analysis as
 * one more optional, gracefully-missing signal — see scoring-service.ts).
 */
export function createThumbnailAnalyzer(config: ThumbnailAnalyzerConfig): ThumbnailAnalyzer | undefined {
  const openai = config.openaiApiKey
    ? new OpenAIThumbnailAnalyzer(config.openaiApiKey, config.openaiModel)
    : undefined;
  const claude = config.anthropicApiKey ? new ClaudeThumbnailAnalyzer(config.anthropicApiKey) : undefined;

  if (openai && claude) return new FallbackThumbnailAnalyzer(openai, claude);
  return openai ?? claude;
}

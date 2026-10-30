import { describe, expect, it } from "vitest";
import { createDiscoveryTranslator, createThumbnailAnalyzer } from "./factory.js";
import { ClaudeDiscoveryTranslator } from "./claude-translator.js";
import { OpenAIDiscoveryTranslator } from "./openai-translator.js";
import { FallbackDiscoveryTranslator } from "./fallback-translator.js";
import { ClaudeThumbnailAnalyzer } from "./claude-thumbnail-analyzer.js";
import { OpenAIThumbnailAnalyzer } from "./openai-thumbnail-analyzer.js";
import { FallbackThumbnailAnalyzer } from "./fallback-thumbnail-analyzer.js";

describe("createDiscoveryTranslator", () => {
  it("returns undefined with no keys configured, rather than a translator that would fail at call time", () => {
    expect(createDiscoveryTranslator({})).toBeUndefined();
  });

  it("returns OpenAI alone (no fallback) when only OPENAI_API_KEY is set", () => {
    const translator = createDiscoveryTranslator({ openaiApiKey: "key" });
    expect(translator).toBeInstanceOf(OpenAIDiscoveryTranslator);
  });

  it("returns Claude alone (no fallback) when only ANTHROPIC_API_KEY is set", () => {
    const translator = createDiscoveryTranslator({ anthropicApiKey: "key" });
    expect(translator).toBeInstanceOf(ClaudeDiscoveryTranslator);
  });

  it("returns an OpenAI-primary/Claude-fallback composite when both keys are set", () => {
    const translator = createDiscoveryTranslator({ openaiApiKey: "a", anthropicApiKey: "b" });
    expect(translator).toBeInstanceOf(FallbackDiscoveryTranslator);
  });
});

describe("createThumbnailAnalyzer", () => {
  it("returns undefined with no keys configured", () => {
    expect(createThumbnailAnalyzer({})).toBeUndefined();
  });

  it("returns OpenAI alone (no fallback) when only OPENAI_API_KEY is set", () => {
    const analyzer = createThumbnailAnalyzer({ openaiApiKey: "key" });
    expect(analyzer).toBeInstanceOf(OpenAIThumbnailAnalyzer);
  });

  it("returns Claude alone (no fallback) when only ANTHROPIC_API_KEY is set", () => {
    const analyzer = createThumbnailAnalyzer({ anthropicApiKey: "key" });
    expect(analyzer).toBeInstanceOf(ClaudeThumbnailAnalyzer);
  });

  it("returns an OpenAI-primary/Claude-fallback composite when both keys are set", () => {
    const analyzer = createThumbnailAnalyzer({ openaiApiKey: "a", anthropicApiKey: "b" });
    expect(analyzer).toBeInstanceOf(FallbackThumbnailAnalyzer);
  });
});

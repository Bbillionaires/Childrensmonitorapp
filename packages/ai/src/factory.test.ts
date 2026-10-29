import { describe, expect, it } from "vitest";
import { createDiscoveryTranslator } from "./factory.js";
import { ClaudeDiscoveryTranslator } from "./claude-translator.js";
import { OpenAIDiscoveryTranslator } from "./openai-translator.js";
import { FallbackDiscoveryTranslator } from "./fallback-translator.js";

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

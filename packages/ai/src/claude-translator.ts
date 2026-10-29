import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { DiscoveryContext, DiscoveryQuery, DiscoveryTranslator } from "./types.js";
import { DISCOVERY_SYSTEM_PROMPT, buildContextLines, buildUserMessage, discoveryQuerySchema, toDiscoveryQuery } from "./discovery-schema.js";

/**
 * Real implementation against the Claude API (see IMPLEMENTATION_PLAN.md for the
 * `ANTHROPIC_API_KEY` this needs). Uses structured outputs (`output_config.format` with a
 * Zod schema via `client.messages.parse`) so the result is guaranteed schema-valid JSON
 * rather than hand-parsed free text.
 *
 * Positioned as the **fallback** provider behind `OpenAIDiscoveryTranslator` (see
 * fallback-translator.ts) — this is a small, well-specified extraction task run at high
 * volume from a shared, operator-funded key, so a cheaper provider is the default and Claude
 * is reserved for requests the primary provider fails on.
 *
 * NOTE: unit-tested with a mocked Anthropic client (see claude-translator.test.ts); not yet
 * exercised against the live API in this environment, since no ANTHROPIC_API_KEY was
 * available to test with.
 */
export class ClaudeDiscoveryTranslator implements DiscoveryTranslator {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async translate(brief: string, context: DiscoveryContext): Promise<DiscoveryQuery> {
    const response = await this.client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      system: DISCOVERY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(brief, buildContextLines(context)) }],
      output_config: { format: zodOutputFormat(discoveryQuerySchema) },
    });

    if (!response.parsed_output) {
      throw new Error("Could not translate this request into a structured search — try rephrasing it.");
    }
    return toDiscoveryQuery(response.parsed_output);
  }
}

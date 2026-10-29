import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { DiscoveryContext, DiscoveryQuery, DiscoveryTranslator } from "./types.js";
import { DISCOVERY_SYSTEM_PROMPT, buildContextLines, buildUserMessage, discoveryQuerySchema, toDiscoveryQuery } from "./discovery-schema.js";

/**
 * "gpt-5.4-mini" is OpenAI's budget tier as of this writing — a deliberate choice given this
 * runs at high volume against an operator-funded (not per-user) key: it's a small, clearly
 * specified extraction task, not one that needs a flagship model. Override via
 * `OPENAI_MODEL` (e.g. down to "gpt-5.4-nano" for even lower cost, or up if quality on real
 * traffic doesn't hold at this tier) — verify current pricing/availability against OpenAI's
 * own pricing page before relying on this default long-term, since model lineups change.
 */
const DEFAULT_MODEL = "gpt-5.4-mini";

/**
 * The **primary** discovery translator (see fallback-translator.ts) — cost is the deciding
 * factor here, not capability ceiling, since this runs from a shared pool funding every
 * parent's searches. Uses the Responses API's structured outputs (`responses.parse` +
 * `zodTextFormat`) for guaranteed schema-valid JSON, the same approach as the Claude
 * fallback.
 *
 * Unit-tested with a mocked OpenAI client (see openai-translator.test.ts) and separately
 * verified against the live Responses API with a real OPENAI_API_KEY.
 */
export class OpenAIDiscoveryTranslator implements DiscoveryTranslator {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async translate(brief: string, context: DiscoveryContext): Promise<DiscoveryQuery> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(brief, buildContextLines(context)) },
      ],
      text: { format: zodTextFormat(discoveryQuerySchema, "discovery_query") },
    });

    if (!response.output_parsed) {
      throw new Error("Could not translate this request into a structured search — try rephrasing it.");
    }
    return toDiscoveryQuery(response.output_parsed);
  }
}

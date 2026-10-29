import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// zodOutputFormat requires a zod/v4-shaped schema specifically — the rest of this monorepo
// uses the regular "zod" (v3 API) import; zod 3.23+ ships both side by side precisely so one
// file can opt into v4 schemas without migrating everything else.
import { z } from "zod/v4";
import type { DiscoveryContext, DiscoveryQuery, DiscoveryTranslator } from "./types.js";

const discoveryQuerySchema = z.object({
  topics: z
    .array(z.string())
    .min(1)
    .max(8)
    .describe("Specific search keywords/topics extracted from the brief — not the whole sentence."),
  targetAgeRange: z
    .string()
    .nullable()
    .describe("The child's age or age range if the brief states or implies one, else null."),
  maxDurationSeconds: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Maximum video length in seconds if the brief implies one (e.g. 'under 20 minutes' -> 1200), else null."),
  excludedThemes: z
    .array(z.string())
    .describe("Themes to explicitly avoid (e.g. 'scary imagery', 'violence'), or an empty array."),
  minSupervisionScore: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .nullable()
    .describe("A minimum Supervision Score only if the parent explicitly named a number, else null."),
});

const SYSTEM_PROMPT = `You translate a parent's plain-language request for children's video content into structured search parameters. Extract specific search keywords (not the whole sentence), a duration limit only if implied, and themes to avoid only if stated. Never invent a constraint the parent didn't ask for — leave optional fields null rather than guessing.`;

function toDiscoveryQuery(parsed: z.infer<typeof discoveryQuerySchema>): DiscoveryQuery {
  return {
    topics: parsed.topics,
    targetAgeRange: parsed.targetAgeRange ?? undefined,
    maxDurationSeconds: parsed.maxDurationSeconds ?? undefined,
    excludedThemes: parsed.excludedThemes,
    minSupervisionScore: parsed.minSupervisionScore ?? undefined,
  };
}

/**
 * Real implementation against the Claude API (see IMPLEMENTATION_PLAN.md for the
 * `ANTHROPIC_API_KEY` this needs). Uses structured outputs (`output_config.format` with a
 * Zod schema via `client.messages.parse`) so the result is guaranteed schema-valid JSON
 * rather than hand-parsed free text. This is a small, well-specified extraction task — if
 * cost matters more than quality margin here, `claude-haiku-5-5` is a reasonable swap; ask
 * and we'll change it.
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
    const contextLines = [
      context.childAgeRange ? `Child's age range: ${context.childAgeRange}.` : null,
      context.childInterests?.length ? `Child's known interests: ${context.childInterests.join(", ")}.` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ");

    const response = await this.client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [contextLines, `Parent's request: ${brief}`].filter(Boolean).join("\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(discoveryQuerySchema) },
    });

    if (!response.parsed_output) {
      throw new Error("Could not translate this request into a structured search — try rephrasing it.");
    }
    return toDiscoveryQuery(response.parsed_output);
  }
}

export function createDiscoveryTranslator(apiKey: string | undefined): DiscoveryTranslator | undefined {
  return apiKey ? new ClaudeDiscoveryTranslator(apiKey) : undefined;
}

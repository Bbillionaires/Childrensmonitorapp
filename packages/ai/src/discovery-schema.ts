// zod/v4 specifically — both the Anthropic and OpenAI structured-output helpers require (or,
// for OpenAI, at least support) a zod/v4-shaped schema. zod 3.23+ ships both namespaces side
// by side precisely so one file can opt into v4 schemas without migrating everything else in
// this monorepo off the regular "zod" (v3 API) import.
import { z } from "zod/v4";
import type { DiscoveryQuery } from "./types.js";

export const discoveryQuerySchema = z.object({
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
    .describe(
      "Maximum video length in seconds if the brief implies one (e.g. 'under 20 minutes' -> 1200), else null.",
    ),
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

export const DISCOVERY_SYSTEM_PROMPT = `You translate a parent's plain-language request for children's video content into structured search parameters. Extract specific search keywords (not the whole sentence), a duration limit only if implied, and themes to avoid only if stated. Never invent a constraint the parent didn't ask for — leave optional fields null rather than guessing.`;

export function toDiscoveryQuery(parsed: z.infer<typeof discoveryQuerySchema>): DiscoveryQuery {
  return {
    topics: parsed.topics,
    targetAgeRange: parsed.targetAgeRange ?? undefined,
    maxDurationSeconds: parsed.maxDurationSeconds ?? undefined,
    excludedThemes: parsed.excludedThemes,
    minSupervisionScore: parsed.minSupervisionScore ?? undefined,
  };
}

export function buildUserMessage(brief: string, contextLines: string): string {
  return [contextLines, `Parent's request: ${brief}`].filter(Boolean).join("\n\n");
}

export function buildContextLines(context: { childAgeRange?: string; childInterests?: string[] }): string {
  return [
    context.childAgeRange ? `Child's age range: ${context.childAgeRange}.` : null,
    context.childInterests?.length ? `Child's known interests: ${context.childInterests.join(", ")}.` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
}

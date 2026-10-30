import { z } from "zod/v4";
import { SAFETY_CATEGORY_IDS } from "@app/supervision-score";

/**
 * Shared between both vision providers — same `zod/v4` note as discovery-schema.ts: Anthropic's
 * `zodOutputFormat` requires a v4-shaped schema, OpenAI's `zodTextFormat` accepts either, so one
 * schema built with `zod/v4` serves both without migrating the rest of the monorepo off v3.
 */
export const thumbnailAnalysisSchema = z.object({
  flaggedCategories: z
    .array(z.enum(SAFETY_CATEGORY_IDS))
    .describe(
      "Safety categories visibly depicted in the thumbnail image itself (e.g. weapons, violence, nudity). " +
        "Only include a category you can actually see depicted — never guess from context you can't see, and " +
        "return an empty array for an unremarkable thumbnail (most of them).",
    ),
});

export const THUMBNAIL_SYSTEM_PROMPT = `You review a video thumbnail image for a children's content safety system. Identify only safety categories that are visibly depicted in the image itself — not categories you'd guess from a title or general topic. Most thumbnails are unremarkable and should return an empty list. Never flag a category you cannot actually see represented in the image.`;

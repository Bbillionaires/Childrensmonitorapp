import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ThumbnailAnalyzer } from "./types.js";
import { THUMBNAIL_SYSTEM_PROMPT, thumbnailAnalysisSchema } from "./thumbnail-schema.js";

const DEFAULT_MODEL = "gpt-5.4-mini";

/**
 * The **primary** thumbnail analyzer, same cost-tier reasoning as OpenAIDiscoveryTranslator —
 * this runs once per distinct piece of content (never per view, per child, or per submission,
 * since Content is deduplicated globally and scoring only runs when a piece of content is new
 * or its metadata changed), but still from a shared, operator-funded key.
 *
 * Unit-tested with a mocked OpenAI client; not yet exercised against the live Responses API.
 */
export class OpenAIThumbnailAnalyzer implements ThumbnailAnalyzer {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyze(imageUrl: string): Promise<string[]> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        { role: "system", content: THUMBNAIL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Review this video thumbnail." },
            { type: "input_image", image_url: imageUrl, detail: "auto" },
          ],
        },
      ],
      text: { format: zodTextFormat(thumbnailAnalysisSchema, "thumbnail_analysis") },
    });

    if (!response.output_parsed) {
      throw new Error("Could not analyze this thumbnail image.");
    }
    return response.output_parsed.flaggedCategories;
  }
}

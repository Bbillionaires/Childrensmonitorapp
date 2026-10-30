import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ThumbnailAnalyzer } from "./types.js";
import { THUMBNAIL_SYSTEM_PROMPT, thumbnailAnalysisSchema } from "./thumbnail-schema.js";

/**
 * The **fallback** thumbnail analyzer, used only when the primary (OpenAI) call fails — same
 * cost-vs-resilience split as ClaudeDiscoveryTranslator.
 *
 * Unit-tested with a mocked Anthropic client; not yet exercised against the live API.
 */
export class ClaudeThumbnailAnalyzer implements ThumbnailAnalyzer {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(imageUrl: string): Promise<string[]> {
    const response = await this.client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 256,
      system: THUMBNAIL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Review this video thumbnail." },
            { type: "image", source: { type: "url", url: imageUrl } },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(thumbnailAnalysisSchema) },
    });

    if (!response.parsed_output) {
      throw new Error("Could not analyze this thumbnail image.");
    }
    return response.parsed_output.flaggedCategories;
  }
}

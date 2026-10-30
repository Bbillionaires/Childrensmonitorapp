import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { parse: parseMock },
  })),
}));

const { OpenAIThumbnailAnalyzer } = await import("./openai-thumbnail-analyzer.js");

describe("OpenAIThumbnailAnalyzer", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("returns the flagged categories from a structured-output response, using the default cost-tier model", async () => {
    parseMock.mockResolvedValue({ output_parsed: { flaggedCategories: ["weapons", "violence"] } });

    const analyzer = new OpenAIThumbnailAnalyzer("test-key");
    const flags = await analyzer.analyze("https://example.com/thumb.jpg");

    expect(flags).toEqual(["weapons", "violence"]);
    expect(parseMock.mock.calls[0]![0].model).toBe("gpt-5.4-mini");
  });

  it("sends the thumbnail as an input_image content part", async () => {
    parseMock.mockResolvedValue({ output_parsed: { flaggedCategories: [] } });
    const analyzer = new OpenAIThumbnailAnalyzer("test-key");
    await analyzer.analyze("https://example.com/thumb.jpg");

    const userMessage = parseMock.mock.calls[0]![0].input[1];
    const imagePart = userMessage.content.find((part: { type: string }) => part.type === "input_image");
    expect(imagePart.image_url).toBe("https://example.com/thumb.jpg");
  });

  it("returns an empty array for an unremarkable thumbnail, never fabricating a flag", async () => {
    parseMock.mockResolvedValue({ output_parsed: { flaggedCategories: [] } });
    const analyzer = new OpenAIThumbnailAnalyzer("test-key");
    await expect(analyzer.analyze("https://example.com/thumb.jpg")).resolves.toEqual([]);
  });

  it("throws a clear error when the model produces no parseable output", async () => {
    parseMock.mockResolvedValue({ output_parsed: null });
    const analyzer = new OpenAIThumbnailAnalyzer("test-key");
    await expect(analyzer.analyze("https://example.com/thumb.jpg")).rejects.toThrow(/could not analyze/i);
  });
});

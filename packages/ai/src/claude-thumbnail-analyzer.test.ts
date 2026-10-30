import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { parse: parseMock },
  })),
}));

const { ClaudeThumbnailAnalyzer } = await import("./claude-thumbnail-analyzer.js");

describe("ClaudeThumbnailAnalyzer", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("returns the flagged categories from a structured-output response", async () => {
    parseMock.mockResolvedValue({ parsed_output: { flaggedCategories: ["nudity"] } });

    const analyzer = new ClaudeThumbnailAnalyzer("test-key");
    const flags = await analyzer.analyze("https://example.com/thumb.jpg");

    expect(flags).toEqual(["nudity"]);
  });

  it("sends the thumbnail as a URL-sourced image content block", async () => {
    parseMock.mockResolvedValue({ parsed_output: { flaggedCategories: [] } });
    const analyzer = new ClaudeThumbnailAnalyzer("test-key");
    await analyzer.analyze("https://example.com/thumb.jpg");

    const userMessage = parseMock.mock.calls[0]![0].messages[0];
    const imagePart = userMessage.content.find((part: { type: string }) => part.type === "image");
    expect(imagePart.source).toEqual({ type: "url", url: "https://example.com/thumb.jpg" });
  });

  it("throws a clear error when the model produces no parseable output", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });
    const analyzer = new ClaudeThumbnailAnalyzer("test-key");
    await expect(analyzer.analyze("https://example.com/thumb.jpg")).rejects.toThrow(/could not analyze/i);
  });
});

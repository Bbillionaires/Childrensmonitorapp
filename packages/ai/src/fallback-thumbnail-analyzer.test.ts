import { describe, expect, it, vi } from "vitest";
import { FallbackThumbnailAnalyzer } from "./fallback-thumbnail-analyzer.js";
import type { ThumbnailAnalyzer } from "./types.js";

function stubAnalyzer(impl: ThumbnailAnalyzer["analyze"]): ThumbnailAnalyzer {
  return { analyze: impl };
}

describe("FallbackThumbnailAnalyzer", () => {
  it("returns the primary's result and never calls the fallback when the primary succeeds", async () => {
    const primaryFn = vi.fn().mockResolvedValue(["violence"]);
    const fallbackFn = vi.fn();
    const analyzer = new FallbackThumbnailAnalyzer(stubAnalyzer(primaryFn), stubAnalyzer(fallbackFn));

    const result = await analyzer.analyze("https://example.com/thumb.jpg");

    expect(result).toEqual(["violence"]);
    expect(fallbackFn).not.toHaveBeenCalled();
  });

  it("falls back to the secondary provider when the primary throws", async () => {
    const primaryFn = vi.fn().mockRejectedValue(new Error("primary down"));
    const fallbackFn = vi.fn().mockResolvedValue([]);
    const analyzer = new FallbackThumbnailAnalyzer(stubAnalyzer(primaryFn), stubAnalyzer(fallbackFn));

    await expect(analyzer.analyze("https://example.com/thumb.jpg")).resolves.toEqual([]);
    expect(fallbackFn).toHaveBeenCalledTimes(1);
  });

  it("throws a combined error naming both failures when primary and fallback both fail", async () => {
    const primaryFn = vi.fn().mockRejectedValue(new Error("primary down"));
    const fallbackFn = vi.fn().mockRejectedValue(new Error("fallback down"));
    const analyzer = new FallbackThumbnailAnalyzer(stubAnalyzer(primaryFn), stubAnalyzer(fallbackFn));

    await expect(analyzer.analyze("https://example.com/thumb.jpg")).rejects.toThrow(/primary down/);
    await expect(analyzer.analyze("https://example.com/thumb.jpg")).rejects.toThrow(/fallback down/);
  });

  it("rethrows the primary's own error directly when no fallback is configured", async () => {
    const primaryFn = vi.fn().mockRejectedValue(new Error("primary down"));
    const analyzer = new FallbackThumbnailAnalyzer(stubAnalyzer(primaryFn), undefined);

    await expect(analyzer.analyze("https://example.com/thumb.jpg")).rejects.toThrow("primary down");
  });
});

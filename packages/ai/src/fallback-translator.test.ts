import { describe, expect, it, vi } from "vitest";
import { FallbackDiscoveryTranslator } from "./fallback-translator.js";
import type { DiscoveryQuery, DiscoveryTranslator } from "./types.js";

function stubTranslator(impl: DiscoveryTranslator["translate"]): DiscoveryTranslator {
  return { translate: impl };
}

const SAMPLE_QUERY: DiscoveryQuery = { topics: ["a"], excludedThemes: [] };

describe("FallbackDiscoveryTranslator", () => {
  it("returns the primary's result and never calls the fallback when the primary succeeds", async () => {
    const primaryFn = vi.fn().mockResolvedValue(SAMPLE_QUERY);
    const fallbackFn = vi.fn();
    const translator = new FallbackDiscoveryTranslator(stubTranslator(primaryFn), stubTranslator(fallbackFn));

    const result = await translator.translate("brief", {});

    expect(result).toEqual(SAMPLE_QUERY);
    expect(fallbackFn).not.toHaveBeenCalled();
  });

  it("falls back to the secondary provider when the primary throws", async () => {
    const primaryFn = vi.fn().mockRejectedValue(new Error("primary down"));
    const fallbackFn = vi.fn().mockResolvedValue(SAMPLE_QUERY);
    const translator = new FallbackDiscoveryTranslator(stubTranslator(primaryFn), stubTranslator(fallbackFn));

    const result = await translator.translate("brief", {});

    expect(result).toEqual(SAMPLE_QUERY);
    expect(fallbackFn).toHaveBeenCalledTimes(1);
  });

  it("throws a combined error naming both failures when primary and fallback both fail", async () => {
    const primaryFn = vi.fn().mockRejectedValue(new Error("primary down"));
    const fallbackFn = vi.fn().mockRejectedValue(new Error("fallback down"));
    const translator = new FallbackDiscoveryTranslator(stubTranslator(primaryFn), stubTranslator(fallbackFn));

    await expect(translator.translate("brief", {})).rejects.toThrow(/primary down/);
    await expect(translator.translate("brief", {})).rejects.toThrow(/fallback down/);
  });

  it("rethrows the primary's own error directly when no fallback is configured", async () => {
    const primaryFn = vi.fn().mockRejectedValue(new Error("primary down"));
    const translator = new FallbackDiscoveryTranslator(stubTranslator(primaryFn), undefined);

    await expect(translator.translate("brief", {})).rejects.toThrow("primary down");
  });
});

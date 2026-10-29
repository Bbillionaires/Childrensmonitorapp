import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { parse: parseMock },
  })),
}));

const { OpenAIDiscoveryTranslator } = await import("./openai-translator.js");

describe("OpenAIDiscoveryTranslator", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("maps a structured-output response into a DiscoveryQuery, using the default cost-tier model", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        topics: ["planets", "gravity"],
        targetAgeRange: "8",
        maxDurationSeconds: 1200,
        excludedThemes: ["scary imagery"],
        minSupervisionScore: null,
      },
    });

    const translator = new OpenAIDiscoveryTranslator("test-key");
    const query = await translator.translate(
      "educational videos about planets for my 8 year old, under 20 minutes, avoid scary imagery",
      {},
    );

    expect(query).toEqual({
      topics: ["planets", "gravity"],
      targetAgeRange: "8",
      maxDurationSeconds: 1200,
      excludedThemes: ["scary imagery"],
      minSupervisionScore: undefined,
    });
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(parseMock.mock.calls[0]![0].model).toBe("gpt-5.4-mini");
  });

  it("uses a custom model when one is configured (e.g. OPENAI_MODEL)", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        topics: ["x"],
        targetAgeRange: null,
        maxDurationSeconds: null,
        excludedThemes: [],
        minSupervisionScore: null,
      },
    });

    const translator = new OpenAIDiscoveryTranslator("test-key", "gpt-5.4-nano");
    await translator.translate("something", {});

    expect(parseMock.mock.calls[0]![0].model).toBe("gpt-5.4-nano");
  });

  it("throws a clear error when the model produces no parseable output, rather than fabricating a query", async () => {
    parseMock.mockResolvedValue({ output_parsed: null });
    const translator = new OpenAIDiscoveryTranslator("test-key");
    await expect(translator.translate("asdkjhasdkjh", {})).rejects.toThrow(/could not translate/i);
  });

  it("includes child age/interests context in the prompt when provided", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        topics: ["x"],
        targetAgeRange: null,
        maxDurationSeconds: null,
        excludedThemes: [],
        minSupervisionScore: null,
      },
    });
    const translator = new OpenAIDiscoveryTranslator("test-key");
    await translator.translate("something fun", { childAgeRange: "AGE_6_8", childInterests: ["dinosaurs"] });

    const userMessage = parseMock.mock.calls[0]![0].input[1];
    expect(userMessage.content).toContain("AGE_6_8");
    expect(userMessage.content).toContain("dinosaurs");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { parse: parseMock },
  })),
}));

const { ClaudeDiscoveryTranslator, createDiscoveryTranslator } = await import("./claude-translator.js");

describe("ClaudeDiscoveryTranslator", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("maps a structured-output response into a DiscoveryQuery", async () => {
    parseMock.mockResolvedValue({
      parsed_output: {
        topics: ["planets", "gravity", "rockets"],
        targetAgeRange: "8",
        maxDurationSeconds: 1200,
        excludedThemes: ["scary imagery"],
        minSupervisionScore: null,
      },
    });

    const translator = new ClaudeDiscoveryTranslator("test-key");
    const query = await translator.translate(
      "educational videos about planets for my 8 year old, under 20 minutes, avoid scary imagery",
      {},
    );

    expect(query).toEqual({
      topics: ["planets", "gravity", "rockets"],
      targetAgeRange: "8",
      maxDurationSeconds: 1200,
      excludedThemes: ["scary imagery"],
      minSupervisionScore: undefined,
    });
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(parseMock.mock.calls[0]![0].model).toBe("claude-opus-5-5");
  });

  it("throws a clear error when the model produces no parseable output, rather than fabricating a query", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });
    const translator = new ClaudeDiscoveryTranslator("test-key");
    await expect(translator.translate("asdkjhasdkjh", {})).rejects.toThrow(/could not translate/i);
  });

  it("includes child age/interests context in the prompt when provided", async () => {
    parseMock.mockResolvedValue({
      parsed_output: {
        topics: ["x"],
        targetAgeRange: null,
        maxDurationSeconds: null,
        excludedThemes: [],
        minSupervisionScore: null,
      },
    });
    const translator = new ClaudeDiscoveryTranslator("test-key");
    await translator.translate("something fun", { childAgeRange: "AGE_6_8", childInterests: ["dinosaurs"] });

    const userContent = parseMock.mock.calls[0]![0].messages[0].content as string;
    expect(userContent).toContain("AGE_6_8");
    expect(userContent).toContain("dinosaurs");
  });
});

describe("createDiscoveryTranslator", () => {
  it("returns undefined without an API key, rather than a translator that would fail at call time", () => {
    expect(createDiscoveryTranslator(undefined)).toBeUndefined();
  });

  it("returns a real translator instance when a key is present", () => {
    expect(createDiscoveryTranslator("some-key")).toBeInstanceOf(ClaudeDiscoveryTranslator);
  });
});

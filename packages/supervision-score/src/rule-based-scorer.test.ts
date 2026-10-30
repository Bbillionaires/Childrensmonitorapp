import { describe, expect, it } from "vitest";
import { RuleBasedSupervisionScorer, riskBandForScore } from "./rule-based-scorer.js";
import type { ScoringInput } from "./types.js";

const scorer = new RuleBasedSupervisionScorer();

function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    content: {
      id: "content-1",
      title: "Learning the planets of our solar system",
      description: "A calm, educational look at each planet for curious kids.",
      durationSeconds: 600,
      creatorName: "Kids Science Channel",
    },
    providerMadeForKids: null,
    ...overrides,
  };
}

describe("RuleBasedSupervisionScorer", () => {
  it("scores clean, made-for-kids educational metadata near the top of the range with no risk factors", async () => {
    const result = await scorer.score(baseInput({ providerMadeForKids: true }));

    expect(result.modelVersion).toBe("rule-based-v1");
    expect(result.overallScore).toBeGreaterThanOrEqual(950);
    expect(result.categories).toHaveLength(20);
    expect(result.categories.every((c) => c.detectedFactors.length === 0 || c.categoryId === "age_appropriateness")).toBe(
      true,
    );
    expect(riskBandForScore(result.overallScore)).toBe("LOW");
  });

  it("marks down a specific category when a title/description keyword match is found, and raises its confidence", async () => {
    const clean = await scorer.score(baseInput());
    const result = await scorer.score(
      baseInput({
        content: {
          id: "content-2",
          title: "Extremely dangerous stunt compilation",
          description: "Do not try this at home.",
          durationSeconds: 300,
          creatorName: "Stunt Channel",
        },
      }),
    );

    const dangerous = result.categories.find((c) => c.categoryId === "dangerous_challenges")!;
    expect(dangerous.score).toBeLessThan(50);
    expect(dangerous.confidence).toBeGreaterThan(0.5);
    expect(dangerous.detectedFactors.length).toBeGreaterThan(0);

    // Unrelated categories stay at the unflagged baseline.
    const alcohol = result.categories.find((c) => c.categoryId === "alcohol")!;
    expect(alcohol.score).toBe(100);
    expect(alcohol.detectedFactors).toHaveLength(0);

    // One flagged category (out of 20, weighted-average rolled up) pulls the overall score
    // down relative to an otherwise-identical clean input — but doesn't collapse it, since a
    // single category is never the whole picture. See CATEGORY_WEIGHTS for the full rollup.
    expect(result.overallScore).toBeLessThan(clean.overallScore);
  });

  it("never claims certainty from metadata alone — unflagged categories keep confidence below 1.0", async () => {
    const result = await scorer.score(baseInput());
    expect(result.categories.every((c) => c.confidence < 1)).toBe(true);
    expect(result.confidence).toBeLessThan(1);
  });

  it("treats providerMadeForKids as one signal affecting only age_appropriateness, not the whole score", async () => {
    const madeForKids = await scorer.score(baseInput({ providerMadeForKids: true }));
    const notMadeForKids = await scorer.score(baseInput({ providerMadeForKids: false }));
    const unknown = await scorer.score(baseInput({ providerMadeForKids: null }));

    const ageScore = (r: typeof madeForKids) => r.categories.find((c) => c.categoryId === "age_appropriateness")!.score;
    expect(ageScore(madeForKids)).toBeGreaterThan(ageScore(notMadeForKids));

    // Every other category is identical regardless of the made-for-kids flag.
    const otherCategories = (r: typeof madeForKids) =>
      r.categories.filter((c) => c.categoryId !== "age_appropriateness").map((c) => c.score);
    expect(otherCategories(madeForKids)).toEqual(otherCategories(notMadeForKids));
    expect(otherCategories(madeForKids)).toEqual(otherCategories(unknown));

    expect(unknown.signalsUsed).not.toContain("providerMadeForKids");
    expect(madeForKids.signalsUsed).toContain("providerMadeForKids");
  });

  it("reports which signals were actually available, growing as later-milestone fields are populated", async () => {
    const metadataOnly = await scorer.score(baseInput());
    expect(metadataOnly.signalsUsed).toEqual(["content"]);

    const withTranscript = await scorer.score(baseInput({ transcript: "a calm, friendly explanation" }));
    expect(withTranscript.signalsUsed).toContain("transcript");

    const withLinks = await scorer.score(baseInput({ externalLinksFound: ["https://example.com"] }));
    expect(withLinks.signalsUsed).toContain("externalLinksFound");
    const linkCategory = withLinks.categories.find((c) => c.categoryId === "external_link_risk")!;
    expect(linkCategory.score).toBeLessThan(100);
  });

  it("produces a human-readable explanation that names the flagged category when one exists", async () => {
    const result = await scorer.score(
      baseInput({
        content: {
          id: "content-3",
          title: "Casino slot machine big wins",
          description: "Gambling highlights.",
          durationSeconds: 400,
          creatorName: "Casino Clips",
        },
      }),
    );
    expect(result.explanation).toMatch(/gambling/i);
  });

  it("marks down a category a thumbnail analysis flagged, even with clean title/description", async () => {
    const result = await scorer.score(baseInput({ thumbnailFlags: ["weapons"] }));
    const weapons = result.categories.find((c) => c.categoryId === "weapons")!;
    expect(weapons.score).toBeLessThan(100);
    expect(weapons.confidence).toBeGreaterThan(0.5);
    expect(weapons.detectedFactors).toContain("Thumbnail image analysis flagged this category");

    // Every other category is untouched.
    const violence = result.categories.find((c) => c.categoryId === "violence")!;
    expect(violence.score).toBe(100);

    expect(result.signalsUsed).toContain("thumbnailFlags");
  });

  it("records thumbnailFlags as used even when it flags nothing, since the analysis still ran", async () => {
    const result = await scorer.score(baseInput({ thumbnailFlags: [] }));
    expect(result.signalsUsed).toContain("thumbnailFlags");
    expect(result.categories.every((c) => c.score === 100)).toBe(true);
  });

  it("creator signals only corroborate (raise confidence on) an already-triggered grooming_indicators match — never an independent penalty for being new", async () => {
    const newChannelAlone = await scorer.score(
      baseInput({ creatorSignals: { channelAgeDays: 2, subscriberCount: 5, videoCount: 1 } }),
    );
    const grooming = newChannelAlone.categories.find((c) => c.categoryId === "grooming_indicators")!;
    expect(grooming.score).toBe(100); // A new channel alone is not evidence of anything.
    expect(grooming.detectedFactors).toHaveLength(0);
    expect(newChannelAlone.signalsUsed).toContain("creatorSignals");

    const withKeywordMatchOnly = await scorer.score(
      baseInput({
        content: {
          id: "content-4",
          title: "add me on snapchat for more",
          description: null,
          durationSeconds: 120,
          creatorName: "Someone",
        },
      }),
    );
    const matchOnlyConfidence = withKeywordMatchOnly.categories.find((c) => c.categoryId === "grooming_indicators")!
      .confidence;

    const withKeywordMatchAndNewChannel = await scorer.score(
      baseInput({
        content: {
          id: "content-4",
          title: "add me on snapchat for more",
          description: null,
          durationSeconds: 120,
          creatorName: "Someone",
        },
        creatorSignals: { channelAgeDays: 2, subscriberCount: 5, videoCount: 1 },
      }),
    );
    const corroborated = withKeywordMatchAndNewChannel.categories.find((c) => c.categoryId === "grooming_indicators")!;
    expect(corroborated.confidence).toBeGreaterThan(matchOnlyConfidence);
    expect(corroborated.score).toBe(
      withKeywordMatchOnly.categories.find((c) => c.categoryId === "grooming_indicators")!.score,
    );
    expect(corroborated.detectedFactors).toContain("Corroborated by a new or low-history channel");
  });

  it("does not corroborate grooming_indicators from an established channel's signals", async () => {
    const result = await scorer.score(
      baseInput({
        content: {
          id: "content-5",
          title: "add me on snapchat for more",
          description: null,
          durationSeconds: 120,
          creatorName: "Someone",
        },
        creatorSignals: { channelAgeDays: 2000, subscriberCount: 500_000, videoCount: 400 },
      }),
    );
    expect(result.categories.find((c) => c.categoryId === "grooming_indicators")!.detectedFactors).not.toContain(
      "Corroborated by a new or low-history channel",
    );
  });
});

describe("riskBandForScore", () => {
  it.each([
    [1000, "LOW"],
    [900, "LOW"],
    [899, "MODERATE"],
    [700, "MODERATE"],
    [699, "ELEVATED"],
    [500, "ELEVATED"],
    [499, "HIGH"],
    [0, "HIGH"],
  ] as const)("maps %i to %s", (score, band) => {
    expect(riskBandForScore(score)).toBe(band);
  });
});

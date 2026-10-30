import { SAFETY_CATEGORY_IDS, type SafetyCategoryId } from "./categories.js";
import { CATEGORY_TERMS, CATEGORY_WEIGHTS } from "./category-terms.js";
import type { CategoryScore, ScoringInput, SupervisionScoreResult, SupervisionScorer } from "./types.js";

export type RiskBand = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

/** Risk bands exactly as illustrated in SUPERVISION_SCORE.md's "Display" section. */
export function riskBandForScore(overallScore: number): RiskBand {
  if (overallScore >= 900) return "LOW";
  if (overallScore >= 700) return "MODERATE";
  if (overallScore >= 500) return "ELEVATED";
  return "HIGH";
}

const BASELINE_SCORE = 100;
const BASELINE_CONFIDENCE = 0.2;
const FIRST_MATCH_PENALTY = 65;
const ADDITIONAL_MATCH_PENALTY = 8;
const MATCH_CONFIDENCE = 0.85;

function scoreFromMatchCount(matchCount: number): { score: number; confidence: number } {
  if (matchCount === 0) return { score: BASELINE_SCORE, confidence: BASELINE_CONFIDENCE };
  const penalty = FIRST_MATCH_PENALTY + (matchCount - 1) * ADDITIONAL_MATCH_PENALTY;
  return { score: Math.max(0, BASELINE_SCORE - penalty), confidence: MATCH_CONFIDENCE };
}

/**
 * Milestone 5's first real `SupervisionScorer` (see SUPERVISION_SCORE.md's "Milestone 5
 * implementation" section). Metadata-only: title/description keyword matching against
 * `CATEGORY_TERMS`, the provider's own `madeForKids` flag as one input among many (never the
 * verdict itself), plus whatever later-milestone signals (transcript, ocrText,
 * externalLinksFound) happen to already be populated on the input — the scorer doesn't care
 * which milestone produced a signal, only whether it's present.
 *
 * Every category starts at a low-confidence neutral baseline and is only marked down (with
 * confidence raised accordingly) when a specific signal is found — it never claims certainty
 * a title and description alone can't support.
 */
export class RuleBasedSupervisionScorer implements SupervisionScorer {
  readonly modelVersion = "rule-based-v1";

  async score(input: ScoringInput): Promise<SupervisionScoreResult> {
    const combinedText = [input.content.title, input.content.description ?? "", input.transcript ?? "", ...(input.ocrText ?? [])]
      .join(" ")
      .toLowerCase();

    const categories = SAFETY_CATEGORY_IDS.map((categoryId) => this.scoreCategory(categoryId, combinedText, input));

    const totalWeight = SAFETY_CATEGORY_IDS.reduce((sum, id) => sum + CATEGORY_WEIGHTS[id], 0);
    const weightedScoreSum = categories.reduce((sum, c) => sum + c.score * CATEGORY_WEIGHTS[c.categoryId], 0);
    const weightedConfidenceSum = categories.reduce((sum, c) => sum + c.confidence * CATEGORY_WEIGHTS[c.categoryId], 0);

    return {
      modelVersion: this.modelVersion,
      overallScore: Math.round((weightedScoreSum / totalWeight) * 10),
      confidence: Math.round((weightedConfidenceSum / totalWeight) * 100) / 100,
      categories,
      explanation: buildExplanation(categories),
      signalsUsed: buildSignalsUsed(input),
    };
  }

  private scoreCategory(categoryId: SafetyCategoryId, combinedText: string, input: ScoringInput): CategoryScore {
    const terms = CATEGORY_TERMS[categoryId];
    const matchedTerms = terms?.filter((term) => combinedText.includes(term)) ?? [];
    const thumbnailFlagged = input.thumbnailFlags?.includes(categoryId) ?? false;
    const { score, confidence } = scoreFromMatchCount(matchedTerms.length + (thumbnailFlagged ? 1 : 0));
    const detectedFactors = matchedTerms.map((term) => `Matched term: "${term}"`);
    if (thumbnailFlagged) detectedFactors.push("Thumbnail image analysis flagged this category");

    if (categoryId === "grooming_indicators") {
      return this.applyCreatorCorroboration(input.creatorSignals, matchedTerms.length > 0, score, confidence, detectedFactors);
    }

    if (categoryId === "age_appropriateness") {
      return this.applyMadeForKidsSignal(input.providerMadeForKids, score, confidence, detectedFactors);
    }

    if (categoryId === "external_link_risk" && input.externalLinksFound && input.externalLinksFound.length > 0) {
      return {
        categoryId,
        score: Math.max(0, 70 - input.externalLinksFound.length * 10),
        confidence: 0.6,
        detectedFactors: [...detectedFactors, `${input.externalLinksFound.length} external link(s) found in content`],
      };
    }

    return { categoryId, score, confidence, detectedFactors };
  }

  /**
   * A brand-new, low-history channel is a weak, corroborating signal — never independent
   * evidence of risk (most new channels are completely innocuous). It only ever raises
   * confidence on a grooming_indicators match the title/description/transcript text already
   * triggered, and never creates or worsens a score on its own — see CreatorSignals' doc
   * comment in @app/content-providers.
   */
  private applyCreatorCorroboration(
    creatorSignals: ScoringInput["creatorSignals"],
    hadKeywordMatch: boolean,
    score: number,
    confidence: number,
    detectedFactors: string[],
  ): CategoryScore {
    const isNewOrUnprovenChannel =
      creatorSignals &&
      ((creatorSignals.channelAgeDays !== null && creatorSignals.channelAgeDays < 30) ||
        (creatorSignals.videoCount !== null && creatorSignals.videoCount <= 1));

    if (!hadKeywordMatch || !isNewOrUnprovenChannel) {
      return { categoryId: "grooming_indicators", score, confidence, detectedFactors };
    }
    return {
      categoryId: "grooming_indicators",
      score,
      confidence: Math.min(1, confidence + 0.1),
      detectedFactors: [...detectedFactors, "Corroborated by a new or low-history channel"],
    };
  }

  /**
   * `providerMadeForKids` only ever affects `age_appropriateness` — it is one input signal,
   * never adopted as a stand-in for the whole score (see SUPERVISION_SCORE.md's opening
   * section). `null` (no platform signal available) leaves the category at its keyword-match
   * baseline rather than guessing.
   */
  private applyMadeForKidsSignal(
    providerMadeForKids: boolean | null,
    score: number,
    confidence: number,
    detectedFactors: string[],
  ): CategoryScore {
    if (providerMadeForKids === null) {
      return { categoryId: "age_appropriateness", score, confidence, detectedFactors };
    }
    if (providerMadeForKids) {
      return {
        categoryId: "age_appropriateness",
        score: Math.max(score, 95),
        confidence: Math.max(confidence, 0.7),
        detectedFactors: [...detectedFactors, "Platform flags this content as made for kids"],
      };
    }
    return {
      categoryId: "age_appropriateness",
      score: Math.min(score, 70),
      confidence: Math.max(confidence, 0.5),
      detectedFactors: [...detectedFactors, "Platform does not flag this content as made for kids"],
    };
  }
}

function buildExplanation(categories: CategoryScore[]): string {
  const prefix =
    "Rule-based assessment combining title/description keyword matching, platform signals, and — whenever available — transcript text, thumbnail image analysis, and channel history (see signalsUsed for exactly which ones were actually gathered for this piece of content).";
  const flagged = categories.filter((c) => c.detectedFactors.length > 0).sort((a, b) => a.score - b.score);

  if (flagged.length === 0) {
    return `${prefix} No risk indicators were found in the available metadata; confidence stays moderate given how little signal a title and description alone provide.`;
  }

  const details = flagged
    .map((c) => `${c.categoryId.replace(/_/g, " ")} (${c.score}/100: ${c.detectedFactors.join("; ")})`)
    .join("; ");
  return `${prefix} Signals found — ${details}.`;
}

function buildSignalsUsed(input: ScoringInput): string[] {
  const used: string[] = ["content"];
  if (input.providerMadeForKids !== null) used.push("providerMadeForKids");
  if (input.transcript) used.push("transcript");
  if (input.ocrText && input.ocrText.length > 0) used.push("ocrText");
  if (input.externalLinksFound && input.externalLinksFound.length > 0) used.push("externalLinksFound");
  if (input.thumbnailFlags !== undefined) used.push("thumbnailFlags");
  if (input.creatorSignals !== undefined) used.push("creatorSignals");
  return used;
}

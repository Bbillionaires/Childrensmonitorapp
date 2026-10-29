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

function scoreFromMatches(matchedTerms: string[]): { score: number; confidence: number } {
  if (matchedTerms.length === 0) return { score: BASELINE_SCORE, confidence: BASELINE_CONFIDENCE };
  const penalty = FIRST_MATCH_PENALTY + (matchedTerms.length - 1) * ADDITIONAL_MATCH_PENALTY;
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
    const { score, confidence } = scoreFromMatches(matchedTerms);
    const detectedFactors = matchedTerms.map((term) => `Matched term: "${term}"`);

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
    "Rule-based, metadata-only assessment (title/description keyword matching and platform signals only — no transcript, audio, or frame analysis yet).";
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
  return used;
}

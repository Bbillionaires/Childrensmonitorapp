import type { SafetyCategoryId } from "./categories.js";

/**
 * Whatever signals happen to be available for a piece of content. Every field beyond
 * `content`/`providerMadeForKids` is optional and arrives from a later milestone's analysis
 * pipeline (transcript fetch, frame sampling, etc. — see SUPERVISION_SCORE.md). A scorer
 * must degrade gracefully — and report lower confidence — when a signal is missing, never
 * fabricate a signal it doesn't have.
 */
export interface ScoringInput {
  content: {
    id: string;
    title: string;
    description: string | null;
    durationSeconds: number | null;
    creatorName: string | null;
  };
  providerMadeForKids: boolean | null;
  targetAgeRange?: string;
  transcript?: string;
  ocrText?: string[];
  externalLinksFound?: string[];
}

export interface CategoryScore {
  categoryId: SafetyCategoryId;
  score: number; // 0-100, higher = safer
  confidence: number; // 0-1
  detectedFactors: string[];
}

export interface SupervisionScoreResult {
  modelVersion: string;
  overallScore: number; // 0-1000, higher = safer
  confidence: number; // 0-1
  categories: CategoryScore[];
  explanation: string;
  signalsUsed: string[];
}

/**
 * `services/api` is the only caller. A scorer never talks to the database directly — the
 * API persists the result as a new ScoreVersion (append-only, see DATABASE_SCHEMA.md).
 */
export interface SupervisionScorer {
  readonly modelVersion: string;
  score(input: ScoringInput): Promise<SupervisionScoreResult>;
}

import { z } from "zod";

/** Exactly the bands illustrated in SUPERVISION_SCORE.md's "Display" section. */
export const riskBandSchema = z.enum(["LOW", "MODERATE", "ELEVATED", "HIGH"]);
export type RiskBand = z.infer<typeof riskBandSchema>;

export const categoryScoreSummarySchema = z.object({
  categoryId: z.string(),
  displayName: z.string(),
  score: z.number(),
  confidence: z.number(),
  detectedFactors: z.array(z.string()),
});
export type CategoryScoreSummary = z.infer<typeof categoryScoreSummarySchema>;

/** The current, user-facing ScoreVersion for one piece of content — see DATABASE_SCHEMA.md. */
export const supervisionScoreSummarySchema = z.object({
  modelVersion: z.string(),
  overallScore: z.number(),
  confidence: z.number(),
  riskBand: riskBandSchema,
  explanation: z.string(),
  analyzedAt: z.string(),
  categories: z.array(categoryScoreSummarySchema),
});
export type SupervisionScoreSummary = z.infer<typeof supervisionScoreSummarySchema>;

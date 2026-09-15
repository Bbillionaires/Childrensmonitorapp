import { z } from "zod";

export const ageRangeSchema = z.enum([
  "AGE_3_5",
  "AGE_6_8",
  "AGE_9_12",
  "AGE_13_15",
  "AGE_16_17",
]);
export type AgeRangeValue = z.infer<typeof ageRangeSchema>;

export const categoryThresholdLevelSchema = z.enum(["strict", "moderate", "relaxed"]);
export type CategoryThresholdLevel = z.infer<typeof categoryThresholdLevelSchema>;

// Keys are SafetyCategory ids (see SUPERVISION_SCORE.md) — kept as a permissive string
// record rather than a hardcoded enum here so new categories don't require a client rebuild.
export const categoryThresholdOverridesSchema = z.record(z.string(), categoryThresholdLevelSchema);

export const childCreateRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  avatarUrl: z.string().url().optional(),
  ageRange: ageRangeSchema.optional(),
  birthYear: z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  contentCategories: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  supervisionScoreMinimum: z.number().int().min(0).max(1000).default(900),
  categoryThresholdOverrides: categoryThresholdOverridesSchema.optional(),
  dailyLimitMinutes: z.number().int().min(0).max(24 * 60).optional(),
});
export type ChildCreateRequest = z.infer<typeof childCreateRequestSchema>;

export const childUpdateRequestSchema = childCreateRequestSchema.partial();
export type ChildUpdateRequest = z.infer<typeof childUpdateRequestSchema>;

export const childProfileSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  avatarUrl: z.string().nullable(),
  ageRange: ageRangeSchema.nullable(),
  birthYear: z.number().nullable(),
  interests: z.array(z.string()),
  contentCategories: z.array(z.string()),
  supervisionScoreMinimum: z.number(),
  categoryThresholdOverrides: categoryThresholdOverridesSchema.nullable(),
  dailyLimitMinutes: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type ChildProfile = z.infer<typeof childProfileSchema>;

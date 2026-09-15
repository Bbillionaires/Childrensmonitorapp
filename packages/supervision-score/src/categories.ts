/**
 * Mirrors the SafetyCategory seed rows in packages/database/prisma/seed.ts. Kept as a typed
 * const here so a scoring implementation gets compile-time checking against the category
 * set instead of stringly-typed category ids.
 */
export const SAFETY_CATEGORY_IDS = [
  "violence",
  "sexual_content",
  "nudity",
  "grooming_indicators",
  "fear",
  "disturbing_imagery",
  "jump_scares",
  "profanity",
  "drugs",
  "alcohol",
  "weapons",
  "self_harm",
  "dangerous_challenges",
  "bullying",
  "adult_themes",
  "advertising_manipulation",
  "gambling",
  "external_link_risk",
  "hate_extremism",
  "age_appropriateness",
] as const;

export type SafetyCategoryId = (typeof SAFETY_CATEGORY_IDS)[number];

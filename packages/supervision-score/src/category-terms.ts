import type { SafetyCategoryId } from "./categories.js";

/**
 * Weights mirror the SafetyCategory seed rows in packages/database/prisma/seed.ts (same
 * convention as categories.ts) — kept here too so the rule-based scorer can compute an
 * overall 0-1000 rollup without the package ever touching the database itself (see
 * SupervisionScorer's doc comment in types.ts).
 */
export const CATEGORY_WEIGHTS: Record<SafetyCategoryId, number> = {
  violence: 1.2,
  sexual_content: 1.5,
  nudity: 1.5,
  grooming_indicators: 1.8,
  fear: 1.0,
  disturbing_imagery: 1.1,
  jump_scares: 0.8,
  profanity: 1.0,
  drugs: 1.2,
  alcohol: 1.0,
  weapons: 1.1,
  self_harm: 1.8,
  dangerous_challenges: 1.4,
  bullying: 1.1,
  adult_themes: 1.0,
  advertising_manipulation: 0.8,
  gambling: 1.2,
  external_link_risk: 1.0,
  hate_extremism: 1.6,
  age_appropriateness: 1.3,
};

/**
 * Metadata-only (title + description) keyword matching, deliberately simple for a first
 * ("rule-based-v1") model — see SUPERVISION_SCORE.md's "Future analysis inputs" list for
 * what later milestones add (transcript, frame sampling, OCR, etc.) without changing this
 * shape. A term list here is a conservative, high-signal set: short/ambiguous words are
 * avoided to keep false positives low given how little context a title/description gives.
 */
export const CATEGORY_TERMS: Partial<Record<SafetyCategoryId, string[]>> = {
  violence: ["violence", "violent", "fight scene", "gun fight", "war footage", "brutal", "gore"],
  sexual_content: ["sexual", "explicit content", "porn", "nsfw", "erotic"],
  nudity: ["nudity", "naked", "topless"],
  grooming_indicators: ["meet in person", "add me on", "my discord", "my snapchat", "dm me"],
  fear: ["scary", "terrifying", "horror", "nightmare fuel"],
  disturbing_imagery: ["disturbing", "graphic content", "gory", "mutilat"],
  jump_scares: ["jump scare", "jumpscare"],
  profanity: ["explicit lyrics", "uncensored", "foul language", "profanity"],
  drugs: ["cocaine", "heroin", "meth lab", "drug use", "smoking weed", "marijuana use"],
  alcohol: ["drinking game", "getting drunk", "alcohol review", "binge drinking"],
  weapons: ["gun review", "firearm", "weapon tutorial", "how to make a knife"],
  self_harm: ["self-harm", "self harm", "suicide", "suicidal"],
  dangerous_challenges: ["dangerous challenge", "deadly challenge", "do not try this", "extremely dangerous stunt"],
  bullying: ["cyberbullying", "bullying compilation", "roast video"],
  adult_themes: ["mature content", "adult themes", "adults only"],
  advertising_manipulation: ["sponsored by", "use my code", "buy now", "limited time offer", "unboxing haul ad"],
  gambling: ["casino", "slot machine", "sports betting", "gambling"],
  hate_extremism: ["hate speech", "racial slur", "extremist", "terrorist propaganda"],
  // external_link_risk and age_appropriateness have no metadata-only keyword signal of their
  // own — they're driven by other fields below (externalLinksFound, providerMadeForKids) and
  // stay at a low-confidence neutral baseline until Milestone 7's richer signals land.
};

import { z } from "zod";

/** Mirrors @app/billing's SubscriptionStatusValue — kept as a separate literal list here (not
 *  imported from @app/billing) since packages/types is the dependency-free leaf every other
 *  package imports, the same reasoning every other enum in this package follows. */
export const subscriptionStatusSchema = z.enum([
  "INCOMPLETE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "UNPAID",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const checkoutSessionResponseSchema = z.object({
  url: z.string(),
});
export type CheckoutSessionResponse = z.infer<typeof checkoutSessionResponseSchema>;

/**
 * A business/developer signing up for the commercial Supervision Score API — see
 * COMMERCIAL_API.md. Never a parent or child; a completely separate identity space with no
 * login, authenticated only by the API key issued once its subscription activates.
 */
export const apiClientSignupRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email(),
});
export type ApiClientSignupRequest = z.infer<typeof apiClientSignupRequestSchema>;

export const apiClientSignupResponseSchema = z.object({
  apiClientId: z.string(),
  checkoutUrl: z.string(),
});
export type ApiClientSignupResponse = z.infer<typeof apiClientSignupResponseSchema>;

/** POST /api/v1/analyze — the exact contract architected in SUPERVISION_SCORE.md's "Future:
 *  commercial Supervision Score API" section, built for real in Milestone 10. `targetAge` is
 *  accepted for forward compatibility with that original sketch but does not currently change
 *  the computed score — see COMMERCIAL_API.md for why (this engine scores content intrinsically,
 *  0-1000, the same way it does for this app's own parents; there is no age-adjusted model). */
export const commercialAnalyzeRequestSchema = z.object({
  contentUrl: z.string().url(),
  contentType: z.enum(["video", "website"]).optional(),
  targetAge: z.number().int().min(0).max(18).optional(),
});
export type CommercialAnalyzeRequest = z.infer<typeof commercialAnalyzeRequestSchema>;

export const commercialAnalyzeResponseSchema = z.object({
  contentIdentifier: z.string(),
  supervisionScore: z.number(),
  categoryScores: z.record(z.string(), z.number()),
  confidence: z.number(),
  riskFlags: z.array(z.string()),
  explanation: z.string(),
  analysisVersion: z.string(),
});
export type CommercialAnalyzeResponse = z.infer<typeof commercialAnalyzeResponseSchema>;

import { z } from "zod";

/**
 * The two session shapes are deliberately disjoint types (not a shared "session" type with
 * optional fields) so a handler that expects a ParentSessionClaims cannot accidentally
 * compile against a ChildSessionClaims missing a check — see ARCHITECTURE.md's AuthN/AuthZ
 * model and SECURITY_AND_PRIVACY.md's RBAC section.
 */
export const parentSessionClaimsSchema = z.object({
  role: z.literal("PARENT"),
  userId: z.string(),
  parentAccountId: z.string(),
});
export type ParentSessionClaims = z.infer<typeof parentSessionClaimsSchema>;

export const childSessionClaimsSchema = z.object({
  role: z.literal("CHILD"),
  childId: z.string(),
  parentAccountId: z.string(),
  // Milestone 6: which Device row this handoff session is attributed to, so ViewingHistory
  // can record a real device rather than leaving it null — see child-session-service.ts.
  deviceId: z.string(),
});
export type ChildSessionClaims = z.infer<typeof childSessionClaimsSchema>;

export const sessionClaimsSchema = z.discriminatedUnion("role", [
  parentSessionClaimsSchema,
  childSessionClaimsSchema,
]);
export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

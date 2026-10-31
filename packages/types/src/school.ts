import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth.js";
import { contentSummarySchema } from "./content.js";

/**
 * Milestone 11 — see SCHOOL_SEATS.md. A school pays a seat-based monthly subscription and
 * distributes seats to parents by email invite; a parent on a seat is never personally
 * charged. This is a third, independent owner kind alongside "parent" and "api_client" (see
 * packages/billing/src/types.ts), never an extension of the commercial Supervision Score API.
 */
export const schoolRegisterRequestSchema = z.object({
  schoolName: z.string().trim().min(1).max(120),
  adminName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type SchoolRegisterRequest = z.infer<typeof schoolRegisterRequestSchema>;

export const schoolLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type SchoolLoginRequest = z.infer<typeof schoolLoginRequestSchema>;

export const schoolAccountSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  contactEmail: z.string(),
  status: z.string(),
  seatCount: z.number(),
  seatsUsed: z.number(),
});
export type SchoolAccountSummary = z.infer<typeof schoolAccountSummarySchema>;

export const schoolCheckoutRequestSchema = z.object({
  seatCount: z.number().int().min(1).max(10000),
});
export type SchoolCheckoutRequest = z.infer<typeof schoolCheckoutRequestSchema>;

export const schoolSeatInviteRequestSchema = z.object({
  email: emailSchema,
});
export type SchoolSeatInviteRequest = z.infer<typeof schoolSeatInviteRequestSchema>;

export const schoolSeatInviteStatusSchema = z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]);
export type SchoolSeatInviteStatusValue = z.infer<typeof schoolSeatInviteStatusSchema>;

export const schoolSeatInviteSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  status: schoolSeatInviteStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
});
export type SchoolSeatInviteSummary = z.infer<typeof schoolSeatInviteSummarySchema>;

/** What a parent sees before deciding whether to accept — no seat details leaked beyond the
 *  inviting school's name, deliberately, since the invite token itself is the only secret. */
export const schoolSeatInvitePreviewSchema = z.object({
  schoolName: z.string(),
  status: schoolSeatInviteStatusSchema,
});
export type SchoolSeatInvitePreview = z.infer<typeof schoolSeatInvitePreviewSchema>;

/**
 * Milestone 11's structured learning queue status for one child's current device session —
 * see learning-queue-service.ts. `funCandidates`/`learningCandidates` are this child's
 * approved library split by the manual isLearningContent tag (see ChildContentPermission),
 * so the player can render "what's next" without a second round trip.
 */
export const learningQueuePhaseSchema = z.enum(["FUN", "LEARNING_REQUIRED"]);
export type LearningQueuePhase = z.infer<typeof learningQueuePhaseSchema>;

export const learningQueueStatusSchema = z.object({
  enabled: z.boolean(),
  gateEnforced: z.boolean(),
  phase: learningQueuePhaseSchema,
  funRemainingBeforeLearning: z.number(),
  funCandidates: z.array(contentSummarySchema),
  learningCandidates: z.array(contentSummarySchema),
});
export type LearningQueueStatus = z.infer<typeof learningQueueStatusSchema>;

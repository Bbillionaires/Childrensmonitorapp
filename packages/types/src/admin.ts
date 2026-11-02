import { z } from "zod";
import { emailSchema } from "./auth.js";
import { playlistImportRequestSchema, playlistItemSummarySchema } from "./playlist.js";
import { approvalDecisionSchema, contentSubmitRequestSchema, schoolSubjectSchema } from "./content.js";

/**
 * Milestone 12 — a platform operator's own console, a third kind of login alongside a
 * parent's and a school admin's (see AdminSessionClaims). No public registration endpoint:
 * the first admin is provisioned once by the seed script from ADMIN_BOOTSTRAP_EMAIL/
 * ADMIN_BOOTSTRAP_PASSWORD — see ADMIN_CONSOLE.md.
 */
export const adminLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
});
export type AdminProfile = z.infer<typeof adminProfileSchema>;

/**
 * An admin creates the account with just name/email — never a password (see
 * admin-service.ts's createSubscriber): the new parent always sets their own via the
 * existing, role-agnostic reset-password email flow.
 */
export const createSubscriberRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: emailSchema,
});
export type CreateSubscriberRequest = z.infer<typeof createSubscriberRequestSchema>;

export const adminSubscriberSummarySchema = z.object({
  parentAccountId: z.string(),
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  subscriptionStatus: z
    .enum(["INCOMPLETE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "UNPAID"])
    .nullable(),
  childCount: z.number(),
  createdAt: z.string(),
});
export type AdminSubscriberSummary = z.infer<typeof adminSubscriberSummarySchema>;

/**
 * The admin never collects a card number — this is a Stripe Checkout link the subscriber
 * completes themselves, emailed to them and also handed back here so the admin can send it
 * by another channel (e.g. read aloud over the phone) too. See admin-service.ts.
 */
export const paymentLinkResponseSchema = z.object({
  url: z.string(),
});
export type PaymentLinkResponse = z.infer<typeof paymentLinkResponseSchema>;

export const adminChildSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
});
export type AdminChildSummary = z.infer<typeof adminChildSummarySchema>;

/** Mirrors approvalRequestSchema — an admin acting on a specific parent/child's behalf. */
export const adminDecisionRequestSchema = z.object({
  contentId: z.string(),
  decision: approvalDecisionSchema,
  notes: z.string().trim().max(500).optional(),
  isLearningContent: z.boolean().optional(),
  subject: schoolSubjectSchema.optional(),
});
export type AdminDecisionRequest = z.infer<typeof adminDecisionRequestSchema>;

export const curatedPlaylistCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});
export type CuratedPlaylistCreateRequest = z.infer<typeof curatedPlaylistCreateRequestSchema>;

export const curatedPlaylistPublishRequestSchema = z.object({
  published: z.boolean(),
});
export type CuratedPlaylistPublishRequest = z.infer<typeof curatedPlaylistPublishRequestSchema>;

// Importing a whole source playlist and adding one video both reuse the exact same URL
// validation a parent's own playlist-import/content-submit requests use.
export const curatedPlaylistImportRequestSchema = playlistImportRequestSchema;
export type CuratedPlaylistImportRequest = z.infer<typeof curatedPlaylistImportRequestSchema>;

export const curatedPlaylistAddVideoRequestSchema = contentSubmitRequestSchema;
export type CuratedPlaylistAddVideoRequest = z.infer<typeof curatedPlaylistAddVideoRequestSchema>;

export const curatedPlaylistSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  published: z.boolean(),
  createdAt: z.string(),
  items: z.array(playlistItemSummarySchema),
});
export type CuratedPlaylistSummary = z.infer<typeof curatedPlaylistSummarySchema>;

/** What a parent sees in the marketplace — no admin-only fields (published is implicit: only
 *  published ones are ever listed here), no raw item list until they've added it to their
 *  own library. */
export const marketplacePlaylistSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  itemCount: z.number(),
  thumbnailUrls: z.array(z.string()),
});
export type MarketplacePlaylistSummary = z.infer<typeof marketplacePlaylistSummarySchema>;

import { z } from "zod";
import { contentSummarySchema } from "./content.js";

/**
 * Deliberately minimal — a child session never needs or receives parental data (safety
 * thresholds, interests, daily limits, etc.), only what's needed to render its own greeting.
 * See SECURITY_AND_PRIVACY.md's data-minimization section.
 */
export const childPublicProfileSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type ChildPublicProfile = z.infer<typeof childPublicProfileSchema>;

export const childPlaylistRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  approvedItemCount: z.number(),
});
export type ChildPlaylistRef = z.infer<typeof childPlaylistRefSchema>;

/**
 * Everything a child is currently allowed to see, already filtered server-side to only
 * approved content — see ARCHITECTURE.md's "closed content environment" principle. The
 * client never filters this list itself; there is nothing to filter out.
 */
export const childLibraryResponseSchema = z.object({
  videos: z.array(contentSummarySchema),
  playlists: z.array(childPlaylistRefSchema),
  websites: z.array(contentSummarySchema),
});
export type ChildLibraryResponse = z.infer<typeof childLibraryResponseSchema>;

export const childPlaylistDetailResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(contentSummarySchema),
});
export type ChildPlaylistDetailResponse = z.infer<typeof childPlaylistDetailResponseSchema>;

const playbackInfoVideoSchema = z.object({
  contentType: z.literal("VIDEO"),
  contentId: z.string(),
  title: z.string(),
  embedUrl: z.string(),
  disableRelatedContent: z.boolean(),
  /** Only set when playing within an approved playlist — autoplay never leaves one. */
  nextContentId: z.string().nullable(),
  /** The ViewingHistory row this play started — see recordPlaybackProgressRequestSchema. */
  viewingHistoryId: z.string(),
});

const playbackInfoWebsiteSchema = z.object({
  contentType: z.literal("WEBSITE"),
  contentId: z.string(),
  title: z.string(),
  url: z.string(),
  allowedDomain: z.string(),
  blockExternalNavigation: z.boolean(),
  viewingHistoryId: z.string(),
});

export const playbackInfoSchema = z.discriminatedUnion("contentType", [
  playbackInfoVideoSchema,
  playbackInfoWebsiteSchema,
]);
export type PlaybackInfo = z.infer<typeof playbackInfoSchema>;

/**
 * Milestone 6: how the child player reports progress back. `positionSeconds` is wall-clock
 * time the page has been open and visible (see child play page) — not exact playback
 * position, which would require integrating the provider's own player API; this is a known,
 * documented limitation (see IMPLEMENTATION_PLAN.md). The server derives
 * `completionPercentage` from the content's own known duration and never trusts a
 * client-reported duration, and `durationWatchedSeconds` only ever moves forward (monotonic)
 * to tolerate pings arriving out of order.
 */
export const recordPlaybackProgressRequestSchema = z.object({
  positionSeconds: z.number().int().min(0),
});
export type RecordPlaybackProgressRequest = z.infer<typeof recordPlaybackProgressRequestSchema>;

export const exitToParentRequestSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4-8 digits"),
});
export type ExitToParentRequest = z.infer<typeof exitToParentRequestSchema>;

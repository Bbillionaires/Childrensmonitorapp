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
});

const playbackInfoWebsiteSchema = z.object({
  contentType: z.literal("WEBSITE"),
  contentId: z.string(),
  title: z.string(),
  url: z.string(),
  allowedDomain: z.string(),
  blockExternalNavigation: z.boolean(),
});

export const playbackInfoSchema = z.discriminatedUnion("contentType", [
  playbackInfoVideoSchema,
  playbackInfoWebsiteSchema,
]);
export type PlaybackInfo = z.infer<typeof playbackInfoSchema>;

export const exitToParentRequestSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4-8 digits"),
});
export type ExitToParentRequest = z.infer<typeof exitToParentRequestSchema>;

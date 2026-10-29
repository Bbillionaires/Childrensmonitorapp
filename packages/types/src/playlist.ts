import { z } from "zod";
import { approvalDecisionSchema, contentSummarySchema } from "./content.js";

export const playlistImportRequestSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "Only https:// URLs are accepted",
  }),
});
export type PlaylistImportRequest = z.infer<typeof playlistImportRequestSchema>;

export const playlistItemSummarySchema = z.object({
  id: z.string(),
  position: z.number(),
  content: contentSummarySchema,
});
export type PlaylistItemSummary = z.infer<typeof playlistItemSummarySchema>;

export const playlistSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(playlistItemSummarySchema),
});
export type PlaylistSummary = z.infer<typeof playlistSummarySchema>;

/** Per-child bulk decision on a set of items from an imported playlist (or any selection). */
export const bulkApprovalRequestSchema = z.object({
  contentIds: z.array(z.string()).min(1).max(200),
  decision: approvalDecisionSchema,
  notes: z.string().trim().max(500).optional(),
});
export type BulkApprovalRequest = z.infer<typeof bulkApprovalRequestSchema>;

export const bulkApprovalResultItemSchema = z.object({
  contentId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type BulkApprovalResultItem = z.infer<typeof bulkApprovalResultItemSchema>;

export const bulkApprovalResponseSchema = z.object({
  results: z.array(bulkApprovalResultItemSchema),
});
export type BulkApprovalResponse = z.infer<typeof bulkApprovalResponseSchema>;

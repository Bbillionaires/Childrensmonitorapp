import { z } from "zod";

export const contentSubmitRequestSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "Only https:// URLs are accepted",
  }),
});
export type ContentSubmitRequest = z.infer<typeof contentSubmitRequestSchema>;

export const contentTypeSchema = z.enum(["VIDEO", "WEBSITE"]);
export type ContentTypeValue = z.infer<typeof contentTypeSchema>;

export const contentSummarySchema = z.object({
  id: z.string(),
  providerId: z.string(),
  contentType: contentTypeSchema,
  sourceUrl: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  creatorName: z.string().nullable(),
  providerMadeForKids: z.boolean().nullable(),
  createdAt: z.string(),
});
export type ContentSummary = z.infer<typeof contentSummarySchema>;

export const approvalDecisionSchema = z.enum(["APPROVED", "REJECTED"]);
export type ApprovalDecisionValue = z.infer<typeof approvalDecisionSchema>;

export const approvalRequestSchema = z.object({
  contentId: z.string(),
  decision: approvalDecisionSchema,
  notes: z.string().trim().max(500).optional(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

/** A piece of content as seen in the context of one specific child's review queue. */
export const childContentReviewItemSchema = z.object({
  content: contentSummarySchema,
  decision: approvalDecisionSchema.nullable(),
  decidedAt: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ChildContentReviewItem = z.infer<typeof childContentReviewItemSchema>;

import { z } from "zod";
import { contentSummarySchema } from "./content.js";

/** Mirrors the Prisma ReportCategory enum exactly — see DATABASE_SCHEMA.md. */
export const reportCategorySchema = z.enum([
  "INAPPROPRIATE_CONTENT",
  "VIOLENCE",
  "SEXUAL_CONTENT",
  "DISTURBING_IMAGERY",
  "GROOMING_INDICATORS",
  "DANGEROUS_CHALLENGE",
  "MISLEADING_AGE_CLASSIFICATION",
  "ADVERTISING",
  "OTHER",
]);
export type ReportCategoryValue = z.infer<typeof reportCategorySchema>;

export const reportStatusSchema = z.enum(["SUBMITTED", "REVIEWED", "VALIDATED", "DISMISSED"]);
export type ReportStatusValue = z.infer<typeof reportStatusSchema>;

export const submitReportRequestSchema = z.object({
  contentId: z.string(),
  childId: z.string().optional(),
  category: reportCategorySchema,
  details: z.string().trim().max(1000).optional(),
});
export type SubmitReportRequest = z.infer<typeof submitReportRequestSchema>;

/**
 * "Validated reports become signals feeding future Supervision Score recalculation" —
 * PRODUCT_REQUIREMENTS.md. This milestone builds submission + the parent's own report list
 * only; there is no moderation/validation workflow yet (no reviewer role exists in this
 * product), so every report starts and stays SUBMITTED here — see IMPLEMENTATION_PLAN.md.
 */
export const parentReportItemSchema = z.object({
  id: z.string(),
  category: reportCategorySchema,
  status: reportStatusSchema,
  details: z.string().nullable(),
  createdAt: z.string(),
  content: contentSummarySchema,
});
export type ParentReportItem = z.infer<typeof parentReportItemSchema>;

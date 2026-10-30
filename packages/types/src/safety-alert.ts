import { z } from "zod";
import { contentSummarySchema } from "./content.js";
import { supervisionScoreSummarySchema } from "./supervision-score.js";

export const alertTypeSchema = z.enum([
  "NEW_SAFETY_INFO",
  "SCORE_DROPPED",
  "PROVIDER_FLAG_CHANGED",
  "PARENT_REPORT_VALIDATED",
]);
export type AlertTypeValue = z.infer<typeof alertTypeSchema>;

export const alertStatusSchema = z.enum(["OPEN", "KEPT_APPROVED", "REMOVED"]);
export type AlertStatusValue = z.infer<typeof alertStatusSchema>;

/**
 * "When previously approved content receives new safety information, the parent is notified
 * and chooses: Keep Approved, Remove, or Review Details" — PRODUCT_REQUIREMENTS.md. Carries
 * both score versions (when the alert came from a re-score) so the UI can show exactly what
 * changed, not just that something did.
 */
export const safetyAlertItemSchema = z.object({
  id: z.string(),
  alertType: alertTypeSchema,
  status: alertStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  content: contentSummarySchema,
  child: z.object({ id: z.string(), firstName: z.string() }),
  previousScore: supervisionScoreSummarySchema.nullable(),
  newScore: supervisionScoreSummarySchema.nullable(),
});
export type SafetyAlertItem = z.infer<typeof safetyAlertItemSchema>;

export const resolveAlertRequestSchema = z.object({
  resolution: z.enum(["KEPT_APPROVED", "REMOVED"]),
});
export type ResolveAlertRequest = z.infer<typeof resolveAlertRequestSchema>;

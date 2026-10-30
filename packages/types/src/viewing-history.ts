import { z } from "zod";

/** One row of the parent-facing activity timeline — see PRODUCT_REQUIREMENTS.md's "Viewing
 * history" section for the exact fields required: content, child, date, start time, duration
 * watched, completion percentage, device, and playlist/source. */
export const viewingHistoryItemSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  durationWatchedSeconds: z.number(),
  completionPercentage: z.number(),
  child: z.object({ id: z.string(), firstName: z.string() }),
  content: z.object({ id: z.string(), title: z.string(), contentType: z.enum(["VIDEO", "WEBSITE"]) }),
  deviceLabel: z.string().nullable(),
  playlistTitle: z.string().nullable(),
});
export type ViewingHistoryItem = z.infer<typeof viewingHistoryItemSchema>;

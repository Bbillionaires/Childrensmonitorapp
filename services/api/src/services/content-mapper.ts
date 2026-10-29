import type { ContentSummary } from "@app/types";

export interface ContentRow {
  id: string;
  providerId: string;
  contentType: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  creatorName: string | null;
  providerMadeForKids: boolean | null;
  createdAt: Date;
}

/**
 * Pulled out of content-service.ts into its own module so scoring-service.ts can reuse it
 * without a circular import (content-service.ts calls into scoring-service.ts to score new
 * content; scoring-service.ts calls back into this mapper to build the ContentSummary rows it
 * returns) — a function this small isn't worth duplicating just to avoid that.
 */
export function toContentSummary(content: ContentRow): ContentSummary {
  return {
    id: content.id,
    providerId: content.providerId,
    contentType: content.contentType as ContentSummary["contentType"],
    sourceUrl: content.sourceUrl,
    title: content.title,
    description: content.description,
    thumbnailUrl: content.thumbnailUrl,
    durationSeconds: content.durationSeconds,
    creatorName: content.creatorName,
    providerMadeForKids: content.providerMadeForKids,
    createdAt: content.createdAt.toISOString(),
    supervisionScore: null,
  };
}

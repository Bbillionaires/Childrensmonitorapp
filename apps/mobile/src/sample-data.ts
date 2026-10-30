import type { ContentSummary } from "@app/types";

/**
 * Static sample data standing in for a real `GET /api/child/library` response — see
 * README.md. Shaped as `ContentSummary` (the same type the web app's child library renders)
 * so swapping this for a real API call later is a data-source change, not a UI rewrite.
 */
export type SampleVideo = ContentSummary & { contentType: "VIDEO" };

export const SAMPLE_LIBRARY: SampleVideo[] = [
  {
    id: "sample-1",
    providerId: "youtube",
    contentType: "VIDEO",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Counting with Friends",
    description: "A sample approved video — this scaffold has no backend connection.",
    thumbnailUrl: null,
    durationSeconds: 212,
    creatorName: "Sample Channel",
    providerMadeForKids: true,
    createdAt: new Date().toISOString(),
    supervisionScore: null,
  },
  {
    id: "sample-2",
    providerId: "youtube",
    contentType: "VIDEO",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Shapes and Colors",
    description: "A sample approved video — this scaffold has no backend connection.",
    thumbnailUrl: null,
    durationSeconds: 184,
    creatorName: "Sample Channel",
    providerMadeForKids: true,
    createdAt: new Date().toISOString(),
    supervisionScore: null,
  },
];

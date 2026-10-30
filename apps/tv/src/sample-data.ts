import type { ContentSummary } from "@app/types";

/** Same static sample data approach as apps/mobile/src/sample-data.ts — see its doc comment. */
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

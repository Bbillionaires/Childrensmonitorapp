import { z } from "zod";
import { approvalDecisionSchema, contentSummarySchema } from "./content.js";

export const discoverySearchRequestSchema = z.object({
  brief: z.string().trim().min(1).max(1000),
  childId: z.string().optional(),
});
export type DiscoverySearchRequest = z.infer<typeof discoverySearchRequestSchema>;

export const discoveryStructuredQuerySchema = z.object({
  topics: z.array(z.string()),
  targetAgeRange: z.string().optional(),
  maxDurationSeconds: z.number().optional(),
  excludedThemes: z.array(z.string()),
  minSupervisionScore: z.number().optional(),
});
export type DiscoveryStructuredQuery = z.infer<typeof discoveryStructuredQuerySchema>;

export const discoveryCandidateSchema = z.object({
  /** The AIRecommendation row id — what approve/reject/create-playlist actions reference. */
  recommendationId: z.string(),
  content: contentSummarySchema,
  matchReason: z.string(),
});
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;

export const discoverySearchResponseSchema = z.object({
  searchRequestId: z.string(),
  structuredQuery: discoveryStructuredQuerySchema,
  candidates: z.array(discoveryCandidateSchema),
});
export type DiscoverySearchResponse = z.infer<typeof discoverySearchResponseSchema>;

export const discoverySavedSearchSchema = z.object({
  id: z.string(),
  rawQuery: z.string(),
  childId: z.string().nullable(),
  createdAt: z.string(),
  candidateCount: z.number(),
});
export type DiscoverySavedSearch = z.infer<typeof discoverySavedSearchSchema>;

/** Powers "Approve Selected" / "Reject" on the discovery results grid. */
export const discoveryDecisionRequestSchema = z.object({
  recommendationIds: z.array(z.string()).min(1).max(50),
  childId: z.string(),
  decision: approvalDecisionSchema,
});
export type DiscoveryDecisionRequest = z.infer<typeof discoveryDecisionRequestSchema>;

export const createPlaylistFromDiscoveryRequestSchema = z.object({
  recommendationIds: z.array(z.string()).min(1).max(50),
  title: z.string().trim().min(1).max(200),
});
export type CreatePlaylistFromDiscoveryRequest = z.infer<typeof createPlaylistFromDiscoveryRequestSchema>;

import { prisma, type Prisma } from "@app/database";
import type { Env } from "@app/config";
import { createDiscoveryTranslator } from "@app/ai";
import type { DiscoveryCandidate, DiscoverySavedSearch, DiscoverySearchResponse } from "@app/types";
import { getProviderRegistry } from "./provider-registry.js";
import { upsertVideoContent, toContentSummary, recordContentSubmission } from "./content-service.js";
import { decideApproval } from "./approval-service.js";
import { writeAuditLog } from "./audit.js";
import { NotFoundError } from "../lib/errors.js";

export class DiscoveryNotConfiguredError extends Error {
  constructor() {
    super("AI-assisted discovery is not configured on this server yet.");
    this.name = "DiscoveryNotConfiguredError";
  }
}

const MAX_CANDIDATES = 12;

/**
 * Natural-language brief -> structured query (Claude, see packages/ai) -> candidate videos
 * (YouTube search, see packages/content-providers). Every candidate is persisted as Content
 * + an AIRecommendation row *before* being shown to the parent — these are suggestions only
 * (PRODUCT_REQUIREMENTS.md): nothing here touches ParentApproval or ChildContentPermission.
 * A child only ever sees a result once the parent explicitly approves it afterward, exactly
 * like any other submitted content.
 */
export async function runDiscoverySearch(
  env: Env,
  parentAccountId: string,
  actorUserId: string,
  childId: string | undefined,
  rawBrief: string,
): Promise<DiscoverySearchResponse> {
  const translator = createDiscoveryTranslator(env.ANTHROPIC_API_KEY);
  if (!translator) throw new DiscoveryNotConfiguredError();

  let child: { ageRange: string | null; interests: string[] } | null = null;
  if (childId) {
    child = await prisma.child.findFirst({
      where: { id: childId, parentAccountId },
      select: { ageRange: true, interests: true },
    });
    if (!child) throw new NotFoundError("Child not found");
  }

  const query = await translator.translate(rawBrief, {
    childAgeRange: child?.ageRange ?? undefined,
    childInterests: child?.interests,
  });

  const registry = getProviderRegistry(env);
  const youtube = registry.getById("youtube");
  if (!youtube?.searchVideos) {
    throw new Error("No searchable content provider is configured");
  }

  // searchVideos propagates ContentProviderNotConfiguredError untouched if YOUTUBE_API_KEY
  // is also missing — the route maps that the same way content submission does.
  let candidates = await youtube.searchVideos({
    query: query.topics.join(" "),
    maxResults: MAX_CANDIDATES,
  });

  if (query.maxDurationSeconds) {
    const maxDuration = query.maxDurationSeconds;
    candidates = candidates.filter((c) => c.durationSeconds === null || c.durationSeconds <= maxDuration);
  }

  const searchRequest = await prisma.searchRequest.create({
    data: {
      parentAccountId,
      childId: childId ?? null,
      rawQuery: rawBrief,
      structuredQuery: query as unknown as Prisma.InputJsonValue,
    },
  });

  const candidateResults: DiscoveryCandidate[] = [];
  for (let rank = 0; rank < candidates.length; rank += 1) {
    const content = await upsertVideoContent(candidates[rank]!, parentAccountId);
    await recordContentSubmission(parentAccountId, actorUserId, content, content.sourceUrl);
    // Honest about how matching works: candidates come from YouTube's own relevance ranking
    // for the derived search terms, not a per-video explanation Claude invented — see
    // IMPLEMENTATION_PLAN.md.
    const matchReason = `Found via search for: ${query.topics.join(", ")}`;
    const recommendation = await prisma.aIRecommendation.create({
      data: { searchRequestId: searchRequest.id, contentId: content.id, matchReason, rank },
    });
    candidateResults.push({
      recommendationId: recommendation.id,
      content: toContentSummary(content),
      matchReason,
    });
  }

  return {
    searchRequestId: searchRequest.id,
    structuredQuery: query,
    candidates: candidateResults,
  };
}

export async function listSavedSearches(parentAccountId: string): Promise<DiscoverySavedSearch[]> {
  const searches = await prisma.searchRequest.findMany({
    where: { parentAccountId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recommendations: true } } },
  });
  return searches.map((search) => ({
    id: search.id,
    rawQuery: search.rawQuery,
    childId: search.childId,
    createdAt: search.createdAt.toISOString(),
    candidateCount: search._count.recommendations,
  }));
}

async function ownedRecommendations(parentAccountId: string, recommendationIds: string[]) {
  const recommendations = await prisma.aIRecommendation.findMany({
    where: {
      id: { in: recommendationIds },
      searchRequest: { parentAccountId },
    },
  });
  if (recommendations.length !== recommendationIds.length) {
    throw new NotFoundError("One or more recommendations were not found in your searches");
  }
  return recommendations;
}

/**
 * "Approve Selected" / "Reject" from the discovery grid. Reuses decideApproval (the single
 * code path that can grant/revoke a ChildContentPermission) tagged with source:
 * "AI_DISCOVERY" for the audit trail, then records the parent's decision back onto the
 * AIRecommendation row itself.
 */
export async function decideDiscoveryRecommendations(
  parentAccountId: string,
  actorUserId: string,
  childId: string,
  recommendationIds: string[],
  decision: "APPROVED" | "REJECTED",
): Promise<void> {
  const recommendations = await ownedRecommendations(parentAccountId, recommendationIds);

  for (const recommendation of recommendations) {
    await decideApproval(
      parentAccountId,
      actorUserId,
      childId,
      recommendation.contentId,
      decision,
      undefined,
      "AI_DISCOVERY",
    );
    await prisma.aIRecommendation.update({
      where: { id: recommendation.id },
      data: { parentDecision: decision },
    });
  }
}

/** "Create Playlist" from a selection of discovery results — a parent-curated collection,
 * not imported from any provider. */
export async function createPlaylistFromDiscovery(
  parentAccountId: string,
  actorUserId: string,
  recommendationIds: string[],
  title: string,
): Promise<{ id: string; title: string }> {
  const recommendations = await ownedRecommendations(parentAccountId, recommendationIds);

  const playlist = await prisma.playlist.create({
    data: { ownerParentAccountId: parentAccountId, title },
  });

  await prisma.playlistItem.createMany({
    data: recommendations.map((recommendation, index) => ({
      playlistId: playlist.id,
      contentId: recommendation.contentId,
      position: index,
    })),
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "PLAYLIST_CREATED_FROM_DISCOVERY",
    targetType: "Playlist",
    targetId: playlist.id,
    metadata: { itemCount: recommendations.length },
  });

  return { id: playlist.id, title: playlist.title };
}

import { prisma } from "@app/database";
import type { Env } from "@app/config";
import type { ChildLibraryResponse, ChildPlaylistDetailResponse, PlaybackInfo } from "@app/types";
import { getProviderRegistry } from "./provider-registry.js";
import { toContentSummary } from "./content-service.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * Everything approved for this child, grouped by type. Derived entirely from
 * ChildContentPermission — the single source of truth for "what can this child see" (see
 * ARCHITECTURE.md's "closed content environment" principle). There is no path here that
 * returns anything a `ParentApproval` didn't explicitly grant.
 */
export async function getChildLibrary(childId: string): Promise<ChildLibraryResponse> {
  const permissions = await prisma.childContentPermission.findMany({
    where: { childId },
    include: { content: true },
  });

  const videos = permissions
    .filter((permission) => permission.content.contentType === "VIDEO")
    .map((permission) => toContentSummary(permission.content));
  const websites = permissions
    .filter((permission) => permission.content.contentType === "WEBSITE")
    .map((permission) => toContentSummary(permission.content));

  const approvedContentIds = new Set(permissions.map((permission) => permission.contentId));

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { parentAccountId: true },
  });

  // A playlist is visible to this child if at least one of its items is individually
  // approved for them — approval is per (child, content), never per playlist (see
  // DATABASE_SCHEMA.md's note on Playlist).
  const ownedPlaylists = child
    ? await prisma.playlist.findMany({
        where: { ownerParentAccountId: child.parentAccountId },
        include: { items: { select: { contentId: true } } },
      })
    : [];

  const playlists = ownedPlaylists
    .map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      approvedItemCount: playlist.items.filter((item) => approvedContentIds.has(item.contentId)).length,
    }))
    .filter((playlist) => playlist.approvedItemCount > 0);

  return { videos, playlists, websites };
}

export async function getChildPlaylistDetail(
  childId: string,
  playlistId: string,
): Promise<ChildPlaylistDetailResponse> {
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { parentAccountId: true } });
  if (!child) throw new NotFoundError("Child not found");

  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, ownerParentAccountId: child.parentAccountId },
    include: { items: { orderBy: { position: "asc" }, include: { content: true } } },
  });
  if (!playlist) throw new NotFoundError("Playlist not found");

  const approvedIds = await approvedContentIdsIn(
    childId,
    playlist.items.map((item) => item.contentId),
  );

  const items = playlist.items
    .filter((item) => approvedIds.has(item.contentId))
    .map((item) => toContentSummary(item.content));

  return { id: playlist.id, title: playlist.title, items };
}

async function approvedContentIdsIn(childId: string, contentIds: string[]): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set();
  const permissions = await prisma.childContentPermission.findMany({
    where: { childId, contentId: { in: contentIds } },
    select: { contentId: true },
  });
  return new Set(permissions.map((permission) => permission.contentId));
}

async function findNextApprovedInPlaylist(
  childId: string,
  playlistId: string,
  afterContentId: string,
): Promise<string | null> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!playlist) return null;

  const currentIndex = playlist.items.findIndex((item) => item.contentId === afterContentId);
  if (currentIndex === -1) return null;

  const approvedIds = await approvedContentIdsIn(
    childId,
    playlist.items.map((item) => item.contentId),
  );

  for (let index = currentIndex + 1; index < playlist.items.length; index += 1) {
    const candidate = playlist.items[index]!;
    if (approvedIds.has(candidate.contentId)) return candidate.contentId;
  }
  return null;
}

/**
 * Re-checks the permission at the exact moment of playback, not just when the library was
 * listed — a parent revoking approval must take effect immediately, even mid-browsing-session
 * (see PRODUCT_REQUIREMENTS.md's "Parent approval changes propagate correctly" invariant and
 * the test covering it). Also records the start of a viewing event (device + playlist source,
 * when known) — Milestone 6 builds the parent-facing activity timeline on top of this same
 * ViewingHistory table, and the child player reports progress back against the row's id (see
 * recordPlaybackProgress below).
 */
export async function getPlaybackInfo(
  env: Env,
  childId: string,
  deviceId: string,
  contentId: string,
  playlistId: string | undefined,
): Promise<PlaybackInfo> {
  const permission = await prisma.childContentPermission.findUnique({
    where: { childId_contentId: { childId, contentId } },
    include: { content: { include: { website: true } } },
  });
  if (!permission) {
    throw new NotFoundError("This content is not approved for this child");
  }

  const { content } = permission;
  const playlistItem = playlistId
    ? await prisma.playlistItem.findFirst({ where: { playlistId, contentId } })
    : null;
  const viewingHistory = await prisma.viewingHistory.create({
    data: { childId, contentId, deviceId, playlistItemId: playlistItem?.id },
  });

  if (content.contentType === "VIDEO") {
    const registry = getProviderRegistry(env);
    const adapter = registry.resolve(content.sourceUrl);
    if (!adapter) {
      throw new Error(`No provider adapter available for content ${contentId}`);
    }
    const embed = adapter.getEmbedInfo(content.providerRefId);
    const nextContentId = playlistId
      ? await findNextApprovedInPlaylist(childId, playlistId, contentId)
      : null;

    return {
      contentType: "VIDEO",
      contentId: content.id,
      title: content.title,
      embedUrl: embed.embedUrl,
      disableRelatedContent: embed.disableRelatedContent,
      nextContentId,
      viewingHistoryId: viewingHistory.id,
    };
  }

  if (!content.website) {
    throw new Error(`Website content ${contentId} is missing its Website row`);
  }

  return {
    contentType: "WEBSITE",
    contentId: content.id,
    title: content.title,
    url: content.sourceUrl,
    allowedDomain: content.website.allowedDomain,
    blockExternalNavigation: content.website.blockExternalNavigation,
    viewingHistoryId: viewingHistory.id,
  };
}

/**
 * `positionSeconds` is wall-clock time the child player has been open and visible, not exact
 * playback position (see `recordPlaybackProgressRequestSchema`'s doc comment) — the server
 * derives `completionPercentage` from the content's own known duration (never a
 * client-supplied one) and only ever moves `durationWatchedSeconds` forward, so a ping that
 * arrives out of order can't erase progress a later one already recorded.
 */
export async function recordPlaybackProgress(childId: string, viewingHistoryId: string, positionSeconds: number) {
  const row = await prisma.viewingHistory.findUnique({
    where: { id: viewingHistoryId },
    include: { content: { select: { durationSeconds: true } } },
  });
  if (!row || row.childId !== childId) {
    throw new NotFoundError("Viewing history entry not found");
  }

  const durationWatchedSeconds = Math.max(row.durationWatchedSeconds, positionSeconds);
  const totalDuration = row.content.durationSeconds;
  const completionPercentage = totalDuration
    ? Math.max(row.completionPercentage, Math.min(100, (durationWatchedSeconds / totalDuration) * 100))
    : row.completionPercentage;

  await prisma.viewingHistory.update({
    where: { id: viewingHistoryId },
    data: { durationWatchedSeconds, completionPercentage },
  });
}

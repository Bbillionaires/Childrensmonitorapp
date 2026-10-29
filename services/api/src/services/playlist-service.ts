import { prisma } from "@app/database";
import type { Env } from "@app/config";
import type { PlaylistSummary } from "@app/types";
import { getProviderRegistry } from "./provider-registry.js";
import { recordContentSubmission, toContentSummary, upsertVideoContent } from "./content-service.js";
import { writeAuditLog } from "./audit.js";

export class PlaylistImportError extends Error {}

/**
 * Fetches a playlist's current items through the owning provider's official API (never
 * scraped — same as single-video submission) and upserts each as Content, same as
 * submitContentUrl would for a single URL. Re-importing an already-imported playlist
 * refreshes its title/items rather than creating a duplicate — see the unique constraint on
 * Playlist in DATABASE_SCHEMA.md.
 */
export async function importPlaylist(
  env: Env,
  parentAccountId: string,
  actorUserId: string,
  url: string,
): Promise<PlaylistSummary> {
  const registry = getProviderRegistry(env);
  const adapter = registry.resolve(url);
  if (!adapter?.fetchPlaylistItems || !adapter.extractPlaylistRefId) {
    throw new PlaylistImportError("This URL's provider doesn't support playlist import");
  }

  const providerRefId = adapter.extractPlaylistRefId(url);
  if (!providerRefId) {
    throw new PlaylistImportError("This doesn't look like a playlist URL");
  }

  // Propagates ContentProviderNotConfiguredError (or any provider fetch failure) untouched —
  // same honesty rule as single-URL submission in content-service.ts.
  const [metadata, items] = await Promise.all([
    adapter.fetchPlaylistMetadata
      ? adapter.fetchPlaylistMetadata(url)
      : Promise.resolve({ title: "Imported playlist", description: null }),
    adapter.fetchPlaylistItems(url),
  ]);

  const playlist = await prisma.playlist.upsert({
    where: {
      ownerParentAccountId_providerId_providerRefId: {
        ownerParentAccountId: parentAccountId,
        providerId: adapter.id,
        providerRefId,
      },
    },
    update: { title: metadata.title, description: metadata.description },
    create: {
      ownerParentAccountId: parentAccountId,
      providerId: adapter.id,
      providerRefId,
      title: metadata.title,
      description: metadata.description,
    },
  });

  // Re-importing reflects the playlist's current contents/order — a video the parent removed
  // from the source playlist should disappear from ours too. Approvals are keyed on
  // (childId, contentId), not on PlaylistItem, so clearing and recreating these rows never
  // touches an existing ParentApproval/ChildContentPermission.
  await prisma.playlistItem.deleteMany({ where: { playlistId: playlist.id } });

  const itemSummaries: PlaylistSummary["items"] = [];
  for (let index = 0; index < items.length; index += 1) {
    const content = await upsertVideoContent(items[index]!, parentAccountId);
    await recordContentSubmission(parentAccountId, actorUserId, content, content.sourceUrl);
    const item = await prisma.playlistItem.create({
      data: { playlistId: playlist.id, contentId: content.id, position: index },
    });
    itemSummaries.push({ id: item.id, position: item.position, content: toContentSummary(content) });
  }

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "PLAYLIST_IMPORTED",
    targetType: "Playlist",
    targetId: playlist.id,
    metadata: { sourceUrl: url, itemCount: itemSummaries.length },
  });

  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    createdAt: playlist.createdAt.toISOString(),
    items: itemSummaries,
  };
}

export async function listPlaylists(parentAccountId: string): Promise<PlaylistSummary[]> {
  const playlists = await prisma.playlist.findMany({
    where: { ownerParentAccountId: parentAccountId },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" }, include: { content: true } } },
  });

  return playlists.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    createdAt: playlist.createdAt.toISOString(),
    items: playlist.items.map((item) => ({
      id: item.id,
      position: item.position,
      content: toContentSummary(item.content),
    })),
  }));
}

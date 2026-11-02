import { prisma } from "@app/database";
import type { Env } from "@app/config";
import type { MarketplacePlaylistSummary, PlaylistSummary } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import { recordContentSubmission, toContentSummary } from "./content-service.js";
import { ensureContentScored } from "./scoring-service.js";
import { writeAuditLog } from "./audit.js";

const MARKETPLACE_THUMBNAIL_LIMIT = 4;

/** Only published curated playlists — see CuratedPlaylist.published's doc comment. */
export async function listPublishedCuratedPlaylists(): Promise<MarketplacePlaylistSummary[]> {
  const curated = await prisma.curatedPlaylist.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" }, include: { content: true } } },
  });

  return curated.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    itemCount: playlist.items.length,
    thumbnailUrls: playlist.items
      .map((item) => item.content.thumbnailUrl)
      .filter((url): url is string => Boolean(url))
      .slice(0, MARKETPLACE_THUMBNAIL_LIMIT),
  }));
}

/**
 * Clones a curated playlist into this parent's own Playlist (upserted by
 * (ownerParentAccountId, sourceCuratedPlaylistId) — see schema.prisma — so adding the same
 * one twice updates the existing clone rather than duplicating it), then, for each item,
 * upserts a PlaylistItem (never create — a curated playlist can itself contain a duplicate
 * video, same reasoning as playlist-service.ts's importPlaylist) and — critically — calls
 * recordContentSubmission + ensureContentScored exactly as a normal playlist import would:
 * this is the moment the content actually enters this parent's own per-child review/approval
 * world, so /playlists' existing approve/reject UI works on a marketplace addition completely
 * unchanged.
 */
export async function addCuratedPlaylistToParent(
  env: Env,
  actorUserId: string,
  parentAccountId: string,
  curatedPlaylistId: string,
): Promise<PlaylistSummary> {
  const curated = await prisma.curatedPlaylist.findFirst({
    where: { id: curatedPlaylistId, published: true },
    include: { items: { orderBy: { position: "asc" }, include: { content: true } } },
  });
  if (!curated) throw new NotFoundError("Playlist not found");

  const playlist = await prisma.playlist.upsert({
    where: { ownerParentAccountId_sourceCuratedPlaylistId: { ownerParentAccountId: parentAccountId, sourceCuratedPlaylistId: curatedPlaylistId } },
    update: { title: curated.title, description: curated.description },
    create: {
      ownerParentAccountId: parentAccountId,
      sourceCuratedPlaylistId: curatedPlaylistId,
      title: curated.title,
      description: curated.description,
    },
  });

  const itemSummaries: PlaylistSummary["items"] = [];
  const summaryIndexById = new Map<string, number>();
  for (let index = 0; index < curated.items.length; index += 1) {
    const content = curated.items[index]!.content;
    await recordContentSubmission(parentAccountId, actorUserId, content, content.sourceUrl);
    await ensureContentScored(env, content.id);
    const item = await prisma.playlistItem.upsert({
      where: { playlistId_contentId: { playlistId: playlist.id, contentId: content.id } },
      update: { position: index },
      create: { playlistId: playlist.id, contentId: content.id, position: index },
    });
    const summary = { id: item.id, position: item.position, content: toContentSummary(content) };
    const existingIndex = summaryIndexById.get(item.id);
    if (existingIndex === undefined) {
      summaryIndexById.set(item.id, itemSummaries.length);
      itemSummaries.push(summary);
    } else {
      itemSummaries[existingIndex] = summary;
    }
  }

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "MARKETPLACE_PLAYLIST_ADDED",
    targetType: "Playlist",
    targetId: playlist.id,
    metadata: { curatedPlaylistId, itemCount: itemSummaries.length },
  });

  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    createdAt: playlist.createdAt.toISOString(),
    items: itemSummaries,
  };
}

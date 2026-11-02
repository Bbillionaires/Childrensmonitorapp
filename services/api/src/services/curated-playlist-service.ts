import { prisma } from "@app/database";
import type { Env } from "@app/config";
import type { CuratedPlaylistSummary } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import { getProviderRegistry } from "./provider-registry.js";
import { toContentSummary, upsertVideoContent, upsertWebsiteContent } from "./content-service.js";
import { ensureContentScored } from "./scoring-service.js";
import { writeAuditLog } from "./audit.js";
import { PlaylistImportError } from "./playlist-service.js";

function toCuratedSummary(curated: {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  createdAt: Date;
  items: Array<{ id: string; position: number; content: Parameters<typeof toContentSummary>[0] }>;
}): CuratedPlaylistSummary {
  return {
    id: curated.id,
    title: curated.title,
    description: curated.description,
    published: curated.published,
    createdAt: curated.createdAt.toISOString(),
    items: curated.items.map((item) => ({
      id: item.id,
      position: item.position,
      content: toContentSummary(item.content),
    })),
  };
}

async function findOwnedCuratedPlaylist(curatedPlaylistId: string) {
  const curated = await prisma.curatedPlaylist.findUnique({ where: { id: curatedPlaylistId } });
  if (!curated) throw new NotFoundError("Curated playlist not found");
  return curated;
}

export async function listCuratedPlaylists(): Promise<CuratedPlaylistSummary[]> {
  const curated = await prisma.curatedPlaylist.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" }, include: { content: true } } },
  });
  return curated.map(toCuratedSummary);
}

export async function getCuratedPlaylist(curatedPlaylistId: string): Promise<CuratedPlaylistSummary> {
  const curated = await prisma.curatedPlaylist.findUnique({
    where: { id: curatedPlaylistId },
    include: { items: { orderBy: { position: "asc" }, include: { content: true } } },
  });
  if (!curated) throw new NotFoundError("Curated playlist not found");
  return toCuratedSummary(curated);
}

export async function createCuratedPlaylist(
  adminUserId: string,
  input: { title: string; description?: string },
): Promise<CuratedPlaylistSummary> {
  const curated = await prisma.curatedPlaylist.create({
    data: { title: input.title, description: input.description, createdByUserId: adminUserId },
  });

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "CURATED_PLAYLIST_CREATED",
    targetType: "CuratedPlaylist",
    targetId: curated.id,
    metadata: { title: curated.title },
  });

  return toCuratedSummary({ ...curated, items: [] });
}

/**
 * Mirrors playlist-service.ts's importPlaylist exactly (fetch via the provider registry,
 * upsert Content, upsert the join row — never create, for the same duplicate-video-in-the-
 * source-playlist reason documented there), but deliberately skips recordContentSubmission:
 * a curated playlist's content doesn't enter anyone's per-child approval queue until a
 * parent actually adds it from the marketplace (see marketplace-service.ts).
 */
export async function importCuratedPlaylistFromUrl(
  env: Env,
  adminUserId: string,
  curatedPlaylistId: string,
  url: string,
): Promise<CuratedPlaylistSummary> {
  await findOwnedCuratedPlaylist(curatedPlaylistId);

  const registry = getProviderRegistry(env);
  const adapter = registry.resolve(url);
  if (!adapter?.fetchPlaylistItems || !adapter.extractPlaylistRefId) {
    throw new PlaylistImportError("This URL's provider doesn't support playlist import");
  }

  const providerRefId = adapter.extractPlaylistRefId(url);
  if (!providerRefId) {
    throw new PlaylistImportError("This doesn't look like a playlist URL");
  }

  const items = await adapter.fetchPlaylistItems(url);

  const existingCount = await prisma.curatedPlaylistItem.count({ where: { curatedPlaylistId } });
  const summaryIndexById = new Map<string, number>();
  const newItems: CuratedPlaylistSummary["items"] = [];
  for (let offset = 0; offset < items.length; offset += 1) {
    const content = await upsertVideoContent(items[offset]!, null);
    await ensureContentScored(env, content.id);
    const position = existingCount + offset;
    const item = await prisma.curatedPlaylistItem.upsert({
      where: { curatedPlaylistId_contentId: { curatedPlaylistId, contentId: content.id } },
      update: { position },
      create: { curatedPlaylistId, contentId: content.id, position },
    });
    const summary = { id: item.id, position: item.position, content: toContentSummary(content) };
    const existingIndex = summaryIndexById.get(item.id);
    if (existingIndex === undefined) {
      summaryIndexById.set(item.id, newItems.length);
      newItems.push(summary);
    } else {
      newItems[existingIndex] = summary;
    }
  }

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "CURATED_PLAYLIST_IMPORTED",
    targetType: "CuratedPlaylist",
    targetId: curatedPlaylistId,
    metadata: { sourceUrl: url, itemCount: newItems.length },
  });

  return getCuratedPlaylist(curatedPlaylistId);
}

/** Single-video/website equivalent of importCuratedPlaylistFromUrl — see its doc comment. */
export async function addCuratedVideoFromUrl(
  env: Env,
  adminUserId: string,
  curatedPlaylistId: string,
  url: string,
): Promise<CuratedPlaylistSummary> {
  await findOwnedCuratedPlaylist(curatedPlaylistId);

  const registry = getProviderRegistry(env);
  const adapter = registry.resolve(url);
  const content = adapter
    ? await upsertVideoContent(await adapter.fetchVideoMetadata(url), null)
    : await upsertWebsiteContent(url, null);
  await ensureContentScored(env, content.id);

  const position = await prisma.curatedPlaylistItem.count({ where: { curatedPlaylistId } });
  await prisma.curatedPlaylistItem.upsert({
    where: { curatedPlaylistId_contentId: { curatedPlaylistId, contentId: content.id } },
    update: {},
    create: { curatedPlaylistId, contentId: content.id, position },
  });

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "CURATED_PLAYLIST_VIDEO_ADDED",
    targetType: "CuratedPlaylist",
    targetId: curatedPlaylistId,
    metadata: { sourceUrl: url },
  });

  return getCuratedPlaylist(curatedPlaylistId);
}

export async function removeCuratedPlaylistItem(curatedPlaylistId: string, itemId: string): Promise<void> {
  const item = await prisma.curatedPlaylistItem.findFirst({ where: { id: itemId, curatedPlaylistId } });
  if (!item) throw new NotFoundError("Playlist item not found");

  await prisma.curatedPlaylistItem.delete({ where: { id: itemId } });
}

export async function setCuratedPlaylistPublished(
  curatedPlaylistId: string,
  published: boolean,
): Promise<CuratedPlaylistSummary> {
  await findOwnedCuratedPlaylist(curatedPlaylistId);
  await prisma.curatedPlaylist.update({ where: { id: curatedPlaylistId }, data: { published } });
  return getCuratedPlaylist(curatedPlaylistId);
}

export async function deleteCuratedPlaylist(curatedPlaylistId: string): Promise<void> {
  await findOwnedCuratedPlaylist(curatedPlaylistId);
  await prisma.curatedPlaylist.delete({ where: { id: curatedPlaylistId } });
}

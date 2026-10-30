import { prisma } from "@app/database";
import type { ViewingHistoryItem } from "@app/types";

/**
 * "Per view: content, child, date, start time, duration watched, completion percentage,
 * device, and playlist/source — presented as a readable activity timeline." —
 * PRODUCT_REQUIREMENTS.md. Every row here comes from a real play recorded by
 * child-library-service.ts's `getPlaybackInfo`/`recordPlaybackProgress` — nothing here is
 * synthesized or estimated beyond what's documented on `recordPlaybackProgressRequestSchema`.
 */
export async function listViewingHistory(parentAccountId: string, limit = 200): Promise<ViewingHistoryItem[]> {
  const rows = await prisma.viewingHistory.findMany({
    where: { child: { parentAccountId } },
    include: {
      child: { select: { id: true, firstName: true } },
      content: { select: { id: true, title: true, contentType: true } },
      device: { select: { label: true } },
      playlistItem: { include: { playlist: { select: { title: true } } } },
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    durationWatchedSeconds: row.durationWatchedSeconds,
    completionPercentage: row.completionPercentage,
    child: row.child,
    content: row.content,
    deviceLabel: row.device?.label ?? null,
    playlistTitle: row.playlistItem?.playlist.title ?? null,
  }));
}

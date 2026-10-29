"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { PlaybackInfo } from "@app/types";
import { apiFetch } from "@/lib/api";

export default function ChildPlayPage() {
  const params = useParams<{ contentId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playlistId = searchParams.get("playlistId") ?? undefined;

  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [replayNonce, setReplayNonce] = useState(0);

  useEffect(() => {
    setPlayback(null);
    setNotFound(false);
    const query = playlistId ? `?playlistId=${playlistId}` : "";
    apiFetch<PlaybackInfo>(`/api/child/content/${params.contentId}/play${query}`)
      .then(setPlayback)
      .catch(() => setNotFound(true));
  }, [params.contentId, playlistId]);

  const backHref = playlistId ? `/child/playlists/${playlistId}` : "/child";

  if (notFound) {
    return (
      <div className="card text-center">
        <p className="text-sm text-slate-600">
          This isn&apos;t approved anymore — a parent may have changed it.
        </p>
        <Link href="/child" className="btn-secondary mt-3 inline-flex">Back to Library</Link>
      </div>
    );
  }

  if (!playback) return <p className="text-center text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-800">{playback.title}</h1>

      {playback.contentType === "VIDEO" ? (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            key={replayNonce}
            src={replayNonce > 0 ? `${playback.embedUrl}&autoplay=1` : playback.embedUrl}
            className="h-full w-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <iframe
            src={playback.url}
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {playback.contentType === "VIDEO" && (
          <button className="btn-secondary" onClick={() => setReplayNonce((n) => n + 1)}>
            ↻ Replay
          </button>
        )}
        {playback.contentType === "VIDEO" && playback.nextContentId && (
          <button
            className="btn-primary"
            onClick={() => router.push(`/child/play/${playback.nextContentId}?playlistId=${playlistId}`)}
          >
            Next Approved Video ▶
          </button>
        )}
        <Link href={backHref} className="btn-secondary">
          Back to Library
        </Link>
      </div>
    </div>
  );
}

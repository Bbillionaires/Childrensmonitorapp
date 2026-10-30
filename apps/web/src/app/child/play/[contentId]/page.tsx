"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { PlaybackInfo } from "@app/types";
import { apiFetch } from "@/lib/api";

const PROGRESS_PING_INTERVAL_MS = 10_000;

/**
 * Tracks wall-clock time this page has been open and visible for `viewingHistoryId`, pinging
 * the server periodically and once on cleanup — see `recordPlaybackProgressRequestSchema`'s
 * doc comment for why this is time-open rather than exact playback position (we don't
 * integrate the provider's player API, so we can't observe pause/seek within a video).
 */
function useProgressReporting(viewingHistoryId: string | undefined) {
  const elapsedSeconds = useRef(0);

  useEffect(() => {
    if (!viewingHistoryId) return;
    elapsedSeconds.current = 0;

    function report() {
      if (elapsedSeconds.current > 0) {
        void apiFetch(`/api/child/viewing-history/${viewingHistoryId}/progress`, {
          method: "POST",
          body: { positionSeconds: Math.round(elapsedSeconds.current) },
        }).catch(() => {
          // Best-effort telemetry — a dropped ping shouldn't interrupt playback.
        });
      }
    }

    const tickId = window.setInterval(() => {
      if (document.visibilityState === "visible") elapsedSeconds.current += 1;
    }, 1000);
    const pingId = window.setInterval(report, PROGRESS_PING_INTERVAL_MS);

    return () => {
      window.clearInterval(tickId);
      window.clearInterval(pingId);
      report();
    };
  }, [viewingHistoryId]);
}

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

  useProgressReporting(playback?.viewingHistoryId);

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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {playback.contentType === "VIDEO" && playback.nextContentId && (
          <button
            className="btn-primary order-first sm:order-none"
            onClick={() => router.push(`/child/play/${playback.nextContentId}?playlistId=${playlistId}`)}
          >
            Next Approved Video ▶
          </button>
        )}
        {playback.contentType === "VIDEO" && (
          <button className="btn-secondary" onClick={() => setReplayNonce((n) => n + 1)}>
            ↻ Replay
          </button>
        )}
        <Link href={backHref} className="btn-secondary">
          Back to Library
        </Link>
      </div>
    </div>
  );
}

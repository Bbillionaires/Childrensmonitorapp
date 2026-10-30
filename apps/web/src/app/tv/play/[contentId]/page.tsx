"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { PlaybackInfo } from "@app/types";
import { apiFetch } from "@/lib/api";
import { useTvAutoFocus } from "@/lib/tv-nav";

const PROGRESS_PING_INTERVAL_MS = 10_000;

/** Same wall-clock-time progress reporting as apps/web/src/app/child/play — see its doc comment. */
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

const ACTION_BUTTON_CLASS =
  "rounded-2xl border-4 border-transparent bg-slate-900 px-8 py-4 text-xl font-semibold text-white focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/40";

export default function TvPlayPage() {
  const params = useParams<{ contentId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playlistId = searchParams.get("playlistId") ?? undefined;

  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [replayNonce, setReplayNonce] = useState(0);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPlayback(null);
    setNotFound(false);
    const query = playlistId ? `?playlistId=${playlistId}` : "";
    apiFetch<PlaybackInfo>(`/api/child/content/${params.contentId}/play${query}`)
      .then(setPlayback)
      .catch(() => setNotFound(true));
  }, [params.contentId, playlistId]);

  useProgressReporting(playback?.viewingHistoryId);
  useTvAutoFocus(actionsRef, [playback]);

  const backHref = playlistId ? `/tv/playlists/${playlistId}` : "/tv";

  if (notFound) {
    return (
      <div className="rounded-3xl bg-slate-900 p-12 text-center">
        <p className="text-xl text-slate-300">
          This isn&apos;t approved anymore — a parent may have changed it.
        </p>
        <Link href="/tv" data-tv-focusable className={`${ACTION_BUTTON_CLASS} mt-6 inline-flex`}>
          Back to Library
        </Link>
      </div>
    );
  }

  if (!playback) return <p className="text-xl text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">{playback.title}</h1>

      {playback.contentType === "VIDEO" ? (
        // A fixed viewport-relative height (not aspect-video) deliberately: aspect-video at
        // full TV width (e.g. 1920px) would make the player alone as tall as a 1080p screen,
        // pushing the action row below the fold with no way to scroll it into view by remote.
        <div className="h-[56vh] w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            key={replayNonce}
            src={replayNonce > 0 ? `${playback.embedUrl}&autoplay=1` : playback.embedUrl}
            className="h-full w-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="h-[56vh] w-full overflow-hidden rounded-2xl border border-slate-700 bg-white">
          <iframe
            src={playback.url}
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      )}

      <div ref={actionsRef} className="flex gap-4">
        {playback.contentType === "VIDEO" && playback.nextContentId && (
          <button
            data-tv-focusable
            className={ACTION_BUTTON_CLASS}
            onClick={() => router.push(`/tv/play/${playback.nextContentId}?playlistId=${playlistId}`)}
          >
            Next Approved Video ▶
          </button>
        )}
        {playback.contentType === "VIDEO" && (
          <button data-tv-focusable className={ACTION_BUTTON_CLASS} onClick={() => setReplayNonce((n) => n + 1)}>
            ↻ Replay
          </button>
        )}
        <Link href={backHref} data-tv-focusable className={ACTION_BUTTON_CLASS}>
          Back to Library
        </Link>
      </div>
    </div>
  );
}

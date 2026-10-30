"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ChildPlaylistDetailResponse } from "@app/types";
import { apiFetch } from "@/lib/api";
import { useTvAutoFocus } from "@/lib/tv-nav";

export default function TvPlaylistPage() {
  const params = useParams<{ playlistId: string }>();
  const [playlist, setPlaylist] = useState<ChildPlaylistDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<ChildPlaylistDetailResponse>(`/api/child/playlists/${params.playlistId}`)
      .then(setPlaylist)
      .catch(() => setNotFound(true));
  }, [params.playlistId]);

  useTvAutoFocus(gridRef, [playlist]);

  if (notFound) {
    return (
      <div className="rounded-3xl bg-slate-900 p-12 text-center">
        <p className="text-xl text-slate-300">This playlist isn&apos;t available.</p>
        <Link href="/tv" data-tv-focusable className="btn-secondary mt-6 inline-flex text-lg focus:outline-none focus:ring-4 focus:ring-brand-400/40">
          Back to Library
        </Link>
      </div>
    );
  }

  if (!playlist) return <p className="text-xl text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">{playlist.title}</h1>
        <Link href="/tv" data-tv-focusable className="rounded-xl border-2 border-slate-700 px-4 py-2 text-lg text-slate-300 focus:border-brand-400 focus:text-white focus:outline-none">
          Back to Library
        </Link>
      </div>
      <div ref={gridRef} className="grid grid-cols-4 gap-6">
        {playlist.items.map((item) => (
          <Link
            key={item.id}
            href={`/tv/play/${item.id}?playlistId=${playlist.id}`}
            data-tv-focusable
            className="flex flex-col overflow-hidden rounded-2xl border-4 border-transparent bg-slate-900 shadow-lg transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/40"
          >
            <div className="flex h-40 items-center justify-center bg-slate-800 text-6xl">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                "🎬"
              )}
            </div>
            <div className="p-4">
              <p className="line-clamp-2 text-xl font-semibold text-white">{item.title}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

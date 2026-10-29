"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ChildPlaylistDetailResponse } from "@app/types";
import { apiFetch } from "@/lib/api";

export default function ChildPlaylistPage() {
  const params = useParams<{ playlistId: string }>();
  const [playlist, setPlaylist] = useState<ChildPlaylistDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiFetch<ChildPlaylistDetailResponse>(`/api/child/playlists/${params.playlistId}`)
      .then(setPlaylist)
      .catch(() => setNotFound(true));
  }, [params.playlistId]);

  if (notFound) {
    return (
      <div className="card text-center">
        <p className="text-sm text-slate-600">This playlist isn&apos;t available.</p>
        <Link href="/child" className="btn-secondary mt-3 inline-flex">Back to Library</Link>
      </div>
    );
  }

  if (!playlist) return <p className="text-center text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">{playlist.title}</h1>
        <Link href="/child" className="text-sm text-brand-600 hover:underline">Back to Library</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {playlist.items.map((item) => (
          <Link
            key={item.id}
            href={`/child/play/${item.id}?playlistId=${playlist.id}`}
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-28 items-center justify-center bg-slate-100 text-4xl">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                "🎬"
              )}
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.title}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

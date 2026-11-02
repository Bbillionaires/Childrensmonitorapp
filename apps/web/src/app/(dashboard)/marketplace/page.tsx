"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketplacePlaylistSummary } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";

export default function MarketplacePage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<MarketplacePlaylistSummary[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ playlists: MarketplacePlaylistSummary[] }>("/api/parents/marketplace").then((data) =>
      setPlaylists(data.playlists),
    );
  }, []);

  async function handleAdd(curatedPlaylistId: string) {
    setError(null);
    setAddingId(curatedPlaylistId);
    try {
      await apiFetch(`/api/parents/marketplace/${curatedPlaylistId}/add`, { method: "POST" });
      router.push("/playlists");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Marketplace</h1>
        <p className="text-sm text-slate-500">Playlists we&apos;ve put together — add any of these to your own library.</p>
      </div>

      {error && <p className="alert-error">{error}</p>}

      {playlists === null && <p className="text-sm text-slate-500">Loading…</p>}
      {playlists?.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">Nothing in the marketplace yet — check back soon.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {playlists?.map((playlist) => (
          <div key={playlist.id} className="card space-y-2">
            {playlist.thumbnailUrls.length > 0 && (
              <div className="flex gap-1 overflow-hidden rounded-lg">
                {playlist.thumbnailUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-16 w-24 shrink-0 object-cover" />
                ))}
              </div>
            )}
            <p className="font-medium text-slate-900">{playlist.title}</p>
            {playlist.description && <p className="text-xs text-slate-500">{playlist.description}</p>}
            <p className="text-xs text-slate-500">
              {playlist.itemCount} item{playlist.itemCount === 1 ? "" : "s"}
            </p>
            <button
              className="btn-primary w-full"
              disabled={addingId === playlist.id}
              onClick={() => void handleAdd(playlist.id)}
            >
              {addingId === playlist.id ? "Adding…" : "Add to my library"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

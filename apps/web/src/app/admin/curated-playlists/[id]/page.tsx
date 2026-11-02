"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { CuratedPlaylistSummary } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";

export default function AdminCuratedPlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<CuratedPlaylistSummary | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPlaylist() {
    const data = await apiFetch<{ playlists: CuratedPlaylistSummary[] }>("/api/admin/curated-playlists");
    setPlaylist(data.playlists.find((item) => item.id === id) ?? null);
  }

  useEffect(() => {
    void loadPlaylist();
  }, [id]);

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setImporting(true);
    try {
      await apiFetch(`/api/admin/curated-playlists/${id}/import`, { method: "POST", body: { url: importUrl } });
      setImportUrl("");
      await loadPlaylist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setImporting(false);
    }
  }

  async function handleAddVideo(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setAddingVideo(true);
    try {
      await apiFetch(`/api/admin/curated-playlists/${id}/videos`, { method: "POST", body: { url: videoUrl } });
      setVideoUrl("");
      await loadPlaylist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setAddingVideo(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    setRemovingId(itemId);
    try {
      await apiFetch(`/api/admin/curated-playlists/${id}/items/${itemId}`, { method: "DELETE" });
      await loadPlaylist();
    } finally {
      setRemovingId(null);
    }
  }

  if (playlist === null) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{playlist.title}</h1>
        <p className="text-sm text-slate-500">{playlist.published ? "Published" : "Draft"}</p>
      </div>

      {error && <p className="alert-error">{error}</p>}

      <div className="card">
        <form onSubmit={handleImport} className="space-y-3">
          <div>
            <label className="field-label" htmlFor="playlist-url">Playlist URL</label>
            <div className="flex gap-2">
              <input
                id="playlist-url"
                type="url"
                required
                placeholder="https://www.youtube.com/playlist?list=…"
                className="field-input"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
              <button type="submit" disabled={importing} className="btn-primary whitespace-nowrap">
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <form onSubmit={handleAddVideo} className="space-y-3">
          <div>
            <label className="field-label" htmlFor="video-url">Add a single video or website</label>
            <div className="flex gap-2">
              <input
                id="video-url"
                type="url"
                required
                placeholder="https://www.youtube.com/watch?v=…"
                className="field-input"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <button type="submit" disabled={addingVideo} className="btn-primary whitespace-nowrap">
                {addingVideo ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="card space-y-1">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Items ({playlist.items.length})</h2>
        {playlist.items.length === 0 && <p className="text-sm text-slate-600">No items yet.</p>}
        {playlist.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            {item.content.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.content.thumbnailUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{item.content.title}</span>
            <button
              className="btn-danger shrink-0"
              disabled={removingId === item.id}
              onClick={() => void handleRemoveItem(item.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { CuratedPlaylistSummary } from "@app/types";
import { curatedPlaylistCreateRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";

export default function AdminCuratedPlaylistsPage() {
  const [playlists, setPlaylists] = useState<CuratedPlaylistSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadPlaylists() {
    const data = await apiFetch<{ playlists: CuratedPlaylistSummary[] }>("/api/admin/curated-playlists");
    setPlaylists(data.playlists);
  }

  useEffect(() => {
    void loadPlaylists();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = curatedPlaylistCreateRequestSchema.safeParse({
      title,
      description: description.trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setCreating(true);
    try {
      await apiFetch("/api/admin/curated-playlists", { method: "POST", body: parsed.data });
      setTitle("");
      setDescription("");
      await loadPlaylists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function handleTogglePublish(playlist: CuratedPlaylistSummary) {
    setTogglingId(playlist.id);
    try {
      await apiFetch(`/api/admin/curated-playlists/${playlist.id}/publish`, {
        method: "PATCH",
        body: { published: !playlist.published },
      });
      await loadPlaylists();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Curated Playlists</h1>
        <p className="text-sm text-slate-500">
          Build playlists parents can pick from the marketplace. Publish one when it&apos;s ready for parents to see.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">New curated playlist</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <p className="alert-error">{error}</p>}
          <div>
            <label className="field-label" htmlFor="title">Title</label>
            <input
              id="title"
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="description">Description (optional)</label>
            <input
              id="description"
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button type="submit" disabled={creating} className="btn-primary">
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
      </div>

      {playlists === null && <p className="text-sm text-slate-500">Loading…</p>}
      {playlists?.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">No curated playlists yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {playlists?.map((playlist) => (
          <div key={playlist.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/admin/curated-playlists/${playlist.id}`} className="font-medium text-brand-700 hover:underline">
                {playlist.title}
              </Link>
              <p className="text-xs text-slate-500">
                {playlist.items.length} item{playlist.items.length === 1 ? "" : "s"} ·{" "}
                {playlist.published ? "Published" : "Draft"}
              </p>
            </div>
            <button
              className={playlist.published ? "btn-secondary" : "btn-primary"}
              disabled={togglingId === playlist.id}
              onClick={() => void handleTogglePublish(playlist)}
            >
              {togglingId === playlist.id ? "Saving…" : playlist.published ? "Unpublish" : "Publish"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

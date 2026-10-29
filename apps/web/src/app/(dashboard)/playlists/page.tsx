"use client";

import { useEffect, useState } from "react";
import type { ApprovalDecisionValue, BulkApprovalResponse, PlaylistSummary } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useChildren } from "@/lib/use-children";

export default function PlaylistsPage() {
  const children = useChildren();
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [selected, setSelected] = useState<PlaylistSummary | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [childId, setChildId] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState<ApprovalDecisionValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);

  async function loadPlaylists() {
    const data = await apiFetch<{ playlists: PlaylistSummary[] }>("/api/parents/playlists");
    setPlaylists(data.playlists);
  }

  useEffect(() => {
    void loadPlaylists();
  }, []);

  useEffect(() => {
    if (children && children.length > 0 && !childId) setChildId(children[0]!.id);
  }, [children, childId]);

  function selectPlaylist(playlist: PlaylistSummary) {
    setSelected(playlist);
    setChecked(new Set(playlist.items.map((item) => item.content.id)));
    setResultSummary(null);
  }

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setImporting(true);
    try {
      const { playlist } = await apiFetch<{ playlist: PlaylistSummary }>("/api/parents/playlists/import", {
        method: "POST",
        body: { url: importUrl },
      });
      setImportUrl("");
      await loadPlaylists();
      selectPlaylist(playlist);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setImporting(false);
    }
  }

  function toggleItem(contentId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return next;
    });
  }

  function selectAll() {
    if (!selected) return;
    setChecked(new Set(selected.items.map((item) => item.content.id)));
  }

  function deselectAll() {
    setChecked(new Set());
  }

  async function applyToSelected(decision: ApprovalDecisionValue) {
    if (!selected || checked.size === 0 || !childId) return;
    setApplying(decision);
    setResultSummary(null);
    try {
      const { results } = await apiFetch<BulkApprovalResponse>(
        `/api/parents/children/${childId}/decisions/bulk`,
        { method: "POST", body: { contentIds: Array.from(checked), decision } },
      );
      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.length - succeeded;
      setResultSummary(
        decision === "APPROVED"
          ? `Approved ${succeeded} item(s)${failed ? `, ${failed} failed` : ""}.`
          : `Rejected ${succeeded} item(s)${failed ? `, ${failed} failed` : ""}.`,
      );
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Playlists</h1>
        <p className="text-sm text-slate-500">
          Import a playlist, then pick exactly which videos each child can see.
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleImport} className="space-y-3">
          {error && <p className="alert-error">{error}</p>}
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

      {playlists && playlists.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => selectPlaylist(playlist)}
              className={`rounded-full border px-3 py-1 text-sm ${
                selected?.id === playlist.id
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {playlist.title} ({playlist.items.length})
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">{selected.title}</h2>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={selectAll}>Select All</button>
              <button className="btn-secondary" onClick={deselectAll}>Deselect All</button>
            </div>
          </div>

          <div className="max-h-96 space-y-1 overflow-y-auto">
            {selected.items.map((item) => (
              <label key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked.has(item.content.id)}
                  onChange={() => toggleItem(item.content.id)}
                  className="h-4 w-4"
                />
                {item.content.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.content.thumbnailUrl} alt="" className="h-9 w-14 rounded object-cover" />
                )}
                <span className="truncate text-sm text-slate-700">{item.content.title}</span>
              </label>
            ))}
          </div>

          {children && children.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <label htmlFor="bulk-child-select" className="text-sm font-medium text-slate-700">
                For
              </label>
              <select
                id="bulk-child-select"
                className="field-input w-auto"
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id}>{child.firstName}</option>
                ))}
              </select>
              <button
                className="btn-primary"
                disabled={checked.size === 0 || applying !== null}
                onClick={() => void applyToSelected("APPROVED")}
              >
                {applying === "APPROVED" ? "Approving…" : `Approve Selected (${checked.size})`}
              </button>
              <button
                className="btn-secondary"
                disabled={checked.size === 0 || applying !== null}
                onClick={() => void applyToSelected("REJECTED")}
              >
                {applying === "REJECTED" ? "Rejecting…" : `Reject Selected (${checked.size})`}
              </button>
            </div>
          )}
          {resultSummary && <p className="alert-success">{resultSummary}</p>}
        </div>
      )}
    </div>
  );
}

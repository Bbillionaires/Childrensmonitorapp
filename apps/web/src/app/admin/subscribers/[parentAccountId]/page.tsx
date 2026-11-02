"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AdminChildSummary, ChildContentReviewItem, PlaylistSummary } from "@app/types";
import { apiFetch } from "@/lib/api";
import { ContentCard } from "@/components/content-card";

export default function AdminSubscriberDetailPage() {
  const { parentAccountId } = useParams<{ parentAccountId: string }>();
  const [children, setChildren] = useState<AdminChildSummary[] | null>(null);
  const [childId, setChildId] = useState("");
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [queue, setQueue] = useState<ChildContentReviewItem[] | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ children: AdminChildSummary[] }>(`/api/admin/subscribers/${parentAccountId}/children`).then(
      (data) => {
        setChildren(data.children);
        if (data.children.length > 0) setChildId(data.children[0]!.id);
      },
    );
    void loadPlaylists();
  }, [parentAccountId]);

  async function loadPlaylists() {
    const data = await apiFetch<{ playlists: PlaylistSummary[] }>(`/api/admin/subscribers/${parentAccountId}/playlists`);
    setPlaylists(data.playlists);
  }

  async function loadQueue(forChildId: string) {
    const data = await apiFetch<{ items: ChildContentReviewItem[] }>(
      `/api/admin/subscribers/${parentAccountId}/children/${forChildId}/queue?filter=PENDING`,
    );
    setQueue(data.items);
  }

  useEffect(() => {
    if (childId) void loadQueue(childId);
  }, [childId]);

  async function handleRemovePlaylistItem(playlistId: string, itemId: string) {
    setRemovingId(itemId);
    try {
      await apiFetch(`/api/admin/subscribers/${parentAccountId}/playlists/${playlistId}/items/${itemId}`, {
        method: "DELETE",
      });
      await loadPlaylists();
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDecision(contentId: string, decision: "APPROVED" | "REJECTED") {
    setDecidingId(contentId);
    try {
      await apiFetch(`/api/admin/subscribers/${parentAccountId}/children/${childId}/decisions`, {
        method: "POST",
        body: { contentId, decision },
      });
      await loadQueue(childId);
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Subscriber</h1>
        <p className="text-sm text-slate-500">Act on this subscriber&apos;s behalf.</p>
      </div>

      {children && children.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="child-select" className="text-sm font-medium text-slate-700">
            Child
          </label>
          <select
            id="child-select"
            className="field-input w-auto"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
          >
            {children.map((child) => (
              <option key={child.id} value={child.id}>{child.firstName}</option>
            ))}
          </select>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Pending review</h2>
        {queue === null && <p className="text-sm text-slate-500">Loading…</p>}
        {queue?.length === 0 && <p className="text-sm text-slate-600">Nothing pending for this child.</p>}
        {queue?.map((item) => (
          <ContentCard
            key={item.content.id}
            content={item.content}
            actions={
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  disabled={decidingId === item.content.id}
                  onClick={() => void handleDecision(item.content.id, "APPROVED")}
                >
                  Approve
                </button>
                <button
                  className="btn-secondary"
                  disabled={decidingId === item.content.id}
                  onClick={() => void handleDecision(item.content.id, "REJECTED")}
                >
                  Reject
                </button>
              </div>
            }
          />
        ))}
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Playlists</h2>
        {playlists === null && <p className="text-sm text-slate-500">Loading…</p>}
        {playlists?.length === 0 && <p className="text-sm text-slate-600">No playlists yet.</p>}
        {playlists?.map((playlist) => (
          <div key={playlist.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900">{playlist.title}</p>
            <div className="mt-2 space-y-1">
              {playlist.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-700">{item.content.title}</span>
                  <button
                    className="btn-danger shrink-0"
                    disabled={removingId === item.id}
                    onClick={() => void handleRemovePlaylistItem(playlist.id, item.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

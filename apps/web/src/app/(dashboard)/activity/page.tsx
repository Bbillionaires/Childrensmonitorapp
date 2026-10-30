"use client";

import { useEffect, useState } from "react";
import type { ViewingHistoryItem } from "@app/types";
import { apiFetch } from "@/lib/api";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const [items, setItems] = useState<ViewingHistoryItem[] | null>(null);
  const [childFilter, setChildFilter] = useState<string>("ALL");

  useEffect(() => {
    void apiFetch<{ items: ViewingHistoryItem[] }>("/api/parents/activity").then((data) => setItems(data.items));
  }, []);

  const children = Array.from(new Map((items ?? []).map((item) => [item.child.id, item.child])).values());
  const filtered = items?.filter((item) => childFilter === "ALL" || item.child.id === childFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Viewing Activity</h1>
        <p className="text-sm text-slate-500">
          A readable timeline of what each child watched, when, for how long, and on which device.
          Duration watched approximates how long the player was open and visible — not exact
          playback position (that would need the provider&apos;s own player API).
        </p>
      </div>

      {children.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="child-filter" className="text-sm font-medium text-slate-700">
            Showing activity for
          </label>
          <select
            id="child-filter"
            className="field-input w-auto"
            value={childFilter}
            onChange={(e) => setChildFilter(e.target.value)}
          >
            <option value="ALL">All children</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.firstName}
              </option>
            ))}
          </select>
        </div>
      )}

      {items === null && <p className="text-sm text-slate-500">Loading…</p>}
      {items?.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">No viewing activity recorded yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered?.map((item) => (
          <div key={item.id} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{item.content.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {item.child.firstName} · {formatStartedAt(item.startedAt)}
                {item.playlistTitle && ` · from “${item.playlistTitle}”`}
                {item.deviceLabel && ` · ${item.deviceLabel}`}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              <p>{formatDuration(item.durationWatchedSeconds)} watched</p>
              {item.content.contentType === "VIDEO" && <p>{Math.round(item.completionPercentage)}% complete</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

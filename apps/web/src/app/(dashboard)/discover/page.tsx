"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApprovalDecisionValue, DiscoveryCandidate, DiscoverySavedSearch, DiscoverySearchResponse } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useChildren } from "@/lib/use-children";
import { ContentCard } from "@/components/content-card";

export default function DiscoverPage() {
  const children = useChildren();
  const [childId, setChildId] = useState("");
  const [brief, setBrief] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoverySearchResponse | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<ApprovalDecisionValue | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<DiscoverySavedSearch[] | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    if (children && children.length > 0 && !childId) setChildId(children[0]!.id);
  }, [children, childId]);

  async function loadSavedSearches() {
    const data = await apiFetch<{ searches: DiscoverySavedSearch[] }>("/api/parents/discover");
    setSavedSearches(data.searches);
  }

  useEffect(() => {
    void loadSavedSearches();
  }, []);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResultSummary(null);
    setSearching(true);
    try {
      const response = await apiFetch<DiscoverySearchResponse>("/api/parents/discover", {
        method: "POST",
        body: { brief, childId: childId || undefined },
      });
      setResult(response);
      setChecked(new Set(response.candidates.map((c) => c.recommendationId)));
      await loadSavedSearches();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSearching(false);
    }
  }

  function toggle(recommendationId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(recommendationId)) next.delete(recommendationId);
      else next.add(recommendationId);
      return next;
    });
  }

  async function applyDecision(decision: ApprovalDecisionValue) {
    if (!result || checked.size === 0 || !childId) return;
    setApplying(decision);
    setResultSummary(null);
    try {
      await apiFetch("/api/parents/discover/decisions", {
        method: "POST",
        body: { recommendationIds: Array.from(checked), childId, decision },
      });
      setResultSummary(decision === "APPROVED" ? `Approved ${checked.size} item(s).` : `Rejected ${checked.size} item(s).`);
    } finally {
      setApplying(null);
    }
  }

  async function handleCreatePlaylist() {
    if (!result || checked.size === 0 || !playlistTitle.trim()) return;
    setCreatingPlaylist(true);
    try {
      await apiFetch("/api/parents/discover/create-playlist", {
        method: "POST",
        body: { recommendationIds: Array.from(checked), title: playlistTitle.trim() },
      });
      setPlaylistTitle("");
      setResultSummary(`Created playlist "${playlistTitle.trim()}" with ${checked.size} item(s). See it under Playlists.`);
    } finally {
      setCreatingPlaylist(false);
    }
  }

  const candidatesById = new Map<string, DiscoveryCandidate>(
    (result?.candidates ?? []).map((c) => [c.recommendationId, c]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Discover Content</h1>
        <p className="text-sm text-slate-500">
          Describe what you&apos;re looking for in plain language. Results are suggestions —
          nothing reaches a child until you approve it.
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSearch} className="space-y-3">
          {error && <p className="alert-error">{error}</p>}
          <div>
            <label className="field-label" htmlFor="brief">What are you looking for?</label>
            <textarea
              id="brief"
              required
              rows={3}
              className="field-input"
              placeholder="Educational videos for my 8-year-old about planets, gravity, and rockets. Keep videos under 20 minutes and avoid scary imagery."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>
          {children && children.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="discover-child" className="text-sm font-medium text-slate-700">For</label>
              <select
                id="discover-child"
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
          <button type="submit" disabled={searching} className="btn-primary">
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
      </div>

      {result && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">
              {result.candidates.length} result{result.candidates.length === 1 ? "" : "s"}
            </h2>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setChecked(new Set(candidatesById.keys()))}>
                Select All
              </button>
              <button className="btn-secondary" onClick={() => setChecked(new Set())}>
                Deselect All
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {result.candidates.map((candidate) => (
              <div key={candidate.recommendationId} className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-6 h-4 w-4"
                  checked={checked.has(candidate.recommendationId)}
                  onChange={() => toggle(candidate.recommendationId)}
                />
                <div className="flex-1">
                  <ContentCard content={candidate.content} />
                  <p className="mt-1 pl-1 text-xs text-slate-400">{candidate.matchReason}</p>
                </div>
              </div>
            ))}
          </div>

          {children && children.length > 0 && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={checked.size === 0 || applying !== null}
                  onClick={() => void applyDecision("APPROVED")}
                >
                  {applying === "APPROVED" ? "Approving…" : `Approve Selected (${checked.size})`}
                </button>
                <button
                  className="btn-secondary"
                  disabled={checked.size === 0 || applying !== null}
                  onClick={() => void applyDecision("REJECTED")}
                >
                  {applying === "REJECTED" ? "Rejecting…" : "Reject Selected"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className="field-input w-auto flex-1"
                  placeholder="Playlist name"
                  value={playlistTitle}
                  onChange={(e) => setPlaylistTitle(e.target.value)}
                />
                <button
                  className="btn-secondary whitespace-nowrap"
                  disabled={checked.size === 0 || !playlistTitle.trim() || creatingPlaylist}
                  onClick={() => void handleCreatePlaylist()}
                >
                  {creatingPlaylist ? "Creating…" : "Create Playlist"}
                </button>
              </div>
              {resultSummary && <p className="alert-success">{resultSummary}</p>}
            </div>
          )}
        </div>
      )}

      {savedSearches && savedSearches.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Saved searches</h2>
          <ul className="space-y-1 text-sm text-slate-600">
            {savedSearches.map((search) => (
              <li key={search.id} className="flex justify-between">
                <span className="truncate">{search.rawQuery}</span>
                <span className="shrink-0 text-slate-400">
                  {search.candidateCount} result{search.candidateCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children !== null && children.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">Add a child profile to approve discovered content for them.</p>
          <Link href="/children" className="btn-primary mt-3 inline-flex">Add a child</Link>
        </div>
      )}
    </div>
  );
}

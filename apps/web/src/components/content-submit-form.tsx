"use client";

import { useState, type FormEvent } from "react";
import type { ContentSummary } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";

export function ContentSubmitForm({ onSubmitted }: { onSubmitted: (content: ContentSummary) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { content } = await apiFetch<{ content: ContentSummary }>("/api/parents/content/submit", {
        method: "POST",
        body: { url },
      });
      setUrl("");
      onSubmitted(content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="alert-error">{error}</p>}
      <div>
        <label className="field-label" htmlFor="content-url">Paste a video or website URL</label>
        <div className="flex gap-2">
          <input
            id="content-url"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=…"
            className="field-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          This only adds it to your review queue — nothing is visible to a child until you approve it for them.
        </p>
      </div>
    </form>
  );
}

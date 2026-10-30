"use client";

import { useState } from "react";
import type { ReportCategoryValue } from "@app/types";
import { apiFetch } from "@/lib/api";

const CATEGORY_OPTIONS: { value: ReportCategoryValue; label: string }[] = [
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
  { value: "VIOLENCE", label: "Violence" },
  { value: "SEXUAL_CONTENT", label: "Sexual content" },
  { value: "DISTURBING_IMAGERY", label: "Disturbing imagery" },
  { value: "GROOMING_INDICATORS", label: "Grooming indicators" },
  { value: "DANGEROUS_CHALLENGE", label: "Dangerous challenge" },
  { value: "MISLEADING_AGE_CLASSIFICATION", label: "Misleading age classification" },
  { value: "ADVERTISING", label: "Advertising" },
  { value: "OTHER", label: "Other" },
];

/** "Parents can report content for: ..." — PRODUCT_REQUIREMENTS.md's "Parent reporting"
 * section. A small, collapsed-by-default affordance on every ContentCard. */
export function ReportContentAction({ contentId, childId }: { contentId: string; childId?: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategoryValue>("INAPPROPRIATE_CONTENT");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await apiFetch("/api/parents/reports", {
        method: "POST",
        body: { contentId, childId, category, details: details.trim() || undefined },
      });
      setSubmitted(true);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <p className="mt-2 text-xs text-slate-400">Reported — thanks, this helps keep the catalog safe.</p>;
  }

  return (
    <div className="mt-2">
      <button type="button" className="text-xs font-medium text-slate-400 hover:text-red-600" onClick={() => setOpen((v) => !v)}>
        {open ? "Cancel report" : "Report this content"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <select
            className="field-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategoryValue)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            className="field-input"
            rows={2}
            placeholder="Details (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <button className="btn-secondary" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </div>
      )}
    </div>
  );
}

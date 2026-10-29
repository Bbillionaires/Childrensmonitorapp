"use client";

import { useState } from "react";
import type { SupervisionScoreSummary } from "@app/types";

const BAND_STYLES: Record<SupervisionScoreSummary["riskBand"], string> = {
  LOW: "bg-emerald-100 text-emerald-800",
  MODERATE: "bg-amber-100 text-amber-800",
  ELEVATED: "bg-orange-100 text-orange-800",
  HIGH: "bg-red-100 text-red-800",
};

const BAND_LABELS: Record<SupervisionScoreSummary["riskBand"], string> = {
  LOW: "Low risk",
  MODERATE: "Moderate risk",
  ELEVATED: "Elevated risk",
  HIGH: "High risk",
};

/**
 * The 0-1000 Supervision Score badge + expandable "Why this score?" category breakdown — see
 * SUPERVISION_SCORE.md's "Display" section. Never presented as a guarantee: the explanation
 * text and per-category confidence are always shown alongside the number.
 */
export function SupervisionScoreBadge({ score }: { score: SupervisionScoreSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${BAND_STYLES[score.riskBand]}`}
      >
        <span>
          Supervision Score: {score.overallScore}/1000 · {BAND_LABELS[score.riskBand]}
        </span>
        <span aria-hidden>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="text-slate-600">{score.explanation}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Model: {score.modelVersion} · Overall confidence: {Math.round(score.confidence * 100)}% · This is a risk
            assessment, not a guarantee.
          </p>
          <div className="mt-3 space-y-1">
            {score.categories.map((category) => (
              <div key={category.categoryId} className="flex items-center justify-between gap-2">
                <span className="text-slate-600">{category.displayName}</span>
                <span className="shrink-0 font-mono text-slate-500">
                  {category.score}/100 ({Math.round(category.confidence * 100)}% conf.)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

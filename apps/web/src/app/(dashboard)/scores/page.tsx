"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApprovedContentScoreItem } from "@app/types";
import { apiFetch } from "@/lib/api";
import { ContentCard } from "@/components/content-card";

export default function ScoresPage() {
  const [items, setItems] = useState<ApprovedContentScoreItem[] | null>(null);

  useEffect(() => {
    void apiFetch<{ items: ApprovedContentScoreItem[] }>("/api/parents/scores").then((data) => {
      // Worst (most worth a parent's attention) first — a score is scored once and rarely
      // changes in this milestone, so this ordering is stable between loads.
      const sorted = [...data.items].sort(
        (a, b) => (a.content.supervisionScore?.overallScore ?? 1000) - (b.content.supervisionScore?.overallScore ?? 1000),
      );
      setItems(sorted);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Supervision Scores</h1>
        <p className="text-sm text-slate-500">
          The 0–1000 safety rating for every piece of content approved for at least one of your
          children, worst first. Expand a score for the full category breakdown. See{" "}
          <span className="font-mono text-xs">SUPERVISION_SCORE.md</span> for how this is computed —
          it is a risk assessment, never a guarantee, and never overrides your own approval decision.
        </p>
      </div>

      {items === null && <p className="text-sm text-slate-500">Loading…</p>}

      {items?.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">
            Nothing approved yet.{" "}
            <Link href="/pending-reviews" className="font-medium text-brand-600 hover:underline">
              Review submitted content
            </Link>{" "}
            to get started.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items?.map((item) => (
          <div key={item.content.id}>
            <ContentCard content={item.content} />
            <p className="mt-1 pl-1 text-xs text-slate-400">
              Approved for: {item.approvedForChildren.map((child) => child.firstName).join(", ")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

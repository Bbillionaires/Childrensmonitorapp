"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChildContentReviewItem } from "@app/types";
import { apiFetch } from "@/lib/api";
import { useChildren } from "@/lib/use-children";
import { ContentCard } from "@/components/content-card";

export default function ApprovedContentPage() {
  const children = useChildren();
  const [childId, setChildId] = useState<string>("");
  const [items, setItems] = useState<ChildContentReviewItem[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (children && children.length > 0 && !childId) {
      setChildId(children[0]!.id);
    }
  }, [children, childId]);

  async function loadApproved(forChildId: string) {
    const data = await apiFetch<{ items: ChildContentReviewItem[] }>(
      `/api/parents/children/${forChildId}/queue?filter=APPROVED`,
    );
    setItems(data.items);
  }

  useEffect(() => {
    if (childId) void loadApproved(childId);
  }, [childId]);

  async function handleRevoke(contentId: string) {
    setRevokingId(contentId);
    try {
      await apiFetch(`/api/parents/children/${childId}/decisions`, {
        method: "POST",
        body: { contentId, decision: "REJECTED" },
      });
      await loadApproved(childId);
    } finally {
      setRevokingId(null);
    }
  }

  if (children === null) return <p className="text-sm text-slate-500">Loading…</p>;

  if (children.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-sm text-slate-600">Add a child profile to start building their approved library.</p>
        <Link href="/children" className="btn-primary mt-3 inline-flex">
          Add a child
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Approved Content</h1>
        <p className="text-sm text-slate-500">Everything this child is currently allowed to see.</p>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="child-select" className="text-sm font-medium text-slate-700">
          Showing library for
        </label>
        <select
          id="child-select"
          className="field-input w-auto"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
        >
          {children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.firstName}
            </option>
          ))}
        </select>
      </div>

      {items === null && <p className="text-sm text-slate-500">Loading…</p>}
      {items?.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">
            Nothing approved yet. Review submitted content under{" "}
            <Link href="/pending-reviews" className="font-medium text-brand-600 hover:underline">
              Pending Reviews
            </Link>
            .
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items?.map((item) => (
          <ContentCard
            key={item.content.id}
            content={item.content}
            actions={
              <button
                className="btn-danger"
                disabled={revokingId === item.content.id}
                onClick={() => void handleRevoke(item.content.id)}
              >
                Revoke approval
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}

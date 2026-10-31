"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApprovalDecisionValue, ChildContentReviewItem, SchoolSubjectValue } from "@app/types";
import { apiFetch } from "@/lib/api";
import { useChildren } from "@/lib/use-children";
import { ContentSubmitForm } from "@/components/content-submit-form";
import { ContentCard } from "@/components/content-card";

const SUBJECT_OPTIONS: { value: SchoolSubjectValue; label: string }[] = [
  { value: "MATH", label: "Math" },
  { value: "READING", label: "Reading" },
  { value: "SCIENCE", label: "Science" },
  { value: "SOCIAL_STUDIES", label: "Social Studies" },
  { value: "LANGUAGE_ARTS", label: "Language Arts" },
  { value: "OTHER", label: "Other" },
];

export default function PendingReviewsPage() {
  const children = useChildren();
  const [childId, setChildId] = useState<string>("");
  const [items, setItems] = useState<ChildContentReviewItem[] | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [learningTags, setLearningTags] = useState<
    Record<string, { isLearningContent: boolean; subject: SchoolSubjectValue }>
  >({});

  function tagFor(contentId: string) {
    return learningTags[contentId] ?? { isLearningContent: false, subject: "OTHER" as SchoolSubjectValue };
  }

  useEffect(() => {
    if (children && children.length > 0 && !childId) {
      setChildId(children[0]!.id);
    }
  }, [children, childId]);

  async function loadQueue(forChildId: string) {
    const data = await apiFetch<{ items: ChildContentReviewItem[] }>(
      `/api/parents/children/${forChildId}/queue?filter=PENDING`,
    );
    setItems(data.items);
  }

  useEffect(() => {
    if (childId) void loadQueue(childId);
  }, [childId]);

  async function handleDecision(contentId: string, decision: ApprovalDecisionValue) {
    setDecidingId(contentId);
    try {
      const tag = tagFor(contentId);
      await apiFetch(`/api/parents/children/${childId}/decisions`, {
        method: "POST",
        body:
          decision === "APPROVED"
            ? { contentId, decision, isLearningContent: tag.isLearningContent, subject: tag.subject }
            : { contentId, decision },
      });
      await loadQueue(childId);
    } finally {
      setDecidingId(null);
    }
  }

  if (children === null) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (children.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-sm text-slate-600">
          Add a child profile first — then anything you submit here can be reviewed for them.
        </p>
        <Link href="/children" className="btn-primary mt-3 inline-flex">
          Add a child
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pending Reviews</h1>
        <p className="text-sm text-slate-500">
          Submit a video or website, then decide whether each child can see it. Nothing reaches a
          child until you approve it.
        </p>
      </div>

      <div className="card">
        <ContentSubmitForm onSubmitted={() => void loadQueue(childId)} />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="child-select" className="text-sm font-medium text-slate-700">
          Reviewing for
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
          <p className="text-sm text-slate-600">Nothing waiting for review. Submit a URL above to get started.</p>
        </div>
      )}

      <div className="space-y-3">
        {items?.map((item) => {
          const tag = tagFor(item.content.id);
          return (
            <ContentCard
              key={item.content.id}
              content={item.content}
              childId={childId}
              actions={
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={tag.isLearningContent}
                      onChange={(e) =>
                        setLearningTags((prev) => ({
                          ...prev,
                          [item.content.id]: { ...tag, isLearningContent: e.target.checked },
                        }))
                      }
                    />
                    Learning content
                    {tag.isLearningContent && (
                      <select
                        className="field-input w-auto py-0.5 text-xs"
                        value={tag.subject}
                        onChange={(e) =>
                          setLearningTags((prev) => ({
                            ...prev,
                            [item.content.id]: { ...tag, subject: e.target.value as SchoolSubjectValue },
                          }))
                        }
                      >
                        {SUBJECT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
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
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

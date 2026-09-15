"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChildCreateRequest, ChildProfile } from "@app/types";
import { apiFetch } from "@/lib/api";
import { ChildForm, AGE_RANGE_OPTIONS } from "@/components/child-form";

function ageRangeLabel(value: ChildProfile["ageRange"]): string {
  return AGE_RANGE_OPTIONS.find((o) => o.value === value)?.label ?? "Not set";
}

export default function ChildrenPage() {
  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const data = await apiFetch<{ children: ChildProfile[] }>("/api/parents/children");
    setChildren(data.children);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(values: ChildCreateRequest) {
    await apiFetch("/api/parents/children", { method: "POST", body: values });
    setShowForm(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Children</h1>
          <p className="text-sm text-slate-500">Each profile gets its own approved library and safety settings.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close" : "Add child"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">New child profile</h2>
          <ChildForm submitLabel="Create profile" onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {children === null && <p className="text-sm text-slate-500">Loading…</p>}

      {children?.length === 0 && !showForm && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">No child profiles yet. Add one to start building their library.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {children?.map((child) => (
          <Link key={child.id} href={`/children/${child.id}`} className="card block transition hover:border-brand-300">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                {child.firstName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{child.firstName}</p>
                <p className="text-xs text-slate-500">{ageRangeLabel(child.ageRange)}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div>
                <dt className="font-medium text-slate-400">Min. Supervision Score</dt>
                <dd className="text-slate-700">{child.supervisionScoreMinimum}/1000</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-400">Daily limit</dt>
                <dd className="text-slate-700">{child.dailyLimitMinutes ? `${child.dailyLimitMinutes} min` : "None set"}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}

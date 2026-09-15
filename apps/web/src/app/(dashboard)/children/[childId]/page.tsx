"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ChildCreateRequest, ChildProfile } from "@app/types";
import { apiFetch } from "@/lib/api";
import { ChildForm, type ChildFormValues } from "@/components/child-form";

function toFormValues(child: ChildProfile): ChildFormValues {
  return {
    firstName: child.firstName,
    ageRange: child.ageRange ?? undefined,
    interests: child.interests.join(", "),
    supervisionScoreMinimum: child.supervisionScoreMinimum,
    dailyLimitMinutes: child.dailyLimitMinutes ? String(child.dailyLimitMinutes) : "",
  };
}

export default function ChildDetailPage() {
  const params = useParams<{ childId: string }>();
  const router = useRouter();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    try {
      const data = await apiFetch<{ child: ChildProfile }>(`/api/parents/children/${params.childId}`);
      setChild(data.child);
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.childId]);

  async function handleUpdate(values: ChildCreateRequest) {
    await apiFetch(`/api/parents/children/${params.childId}`, { method: "PATCH", body: values });
    await load();
  }

  async function handleArchive() {
    if (!confirm(`Remove ${child?.firstName}'s profile? This can't be undone from here.`)) return;
    await apiFetch(`/api/parents/children/${params.childId}`, { method: "DELETE" });
    router.push("/children");
  }

  if (notFound) {
    return <p className="alert-error">This child profile doesn&apos;t exist or isn&apos;t yours to view.</p>;
  }

  if (!child) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{child.firstName}&apos;s profile</h1>
        <p className="text-sm text-slate-500">Safety settings, thresholds, and viewing limits for this child.</p>
      </div>

      <div className="card">
        <ChildForm initialValues={toFormValues(child)} submitLabel="Save changes" onSubmit={handleUpdate} />
      </div>

      <div className="card border-red-100">
        <h2 className="text-sm font-semibold text-slate-900">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Removing a profile archives it — history is preserved, but it stops appearing in your active child list.
        </p>
        <button onClick={handleArchive} className="btn-danger mt-3">
          Remove profile
        </button>
      </div>
    </div>
  );
}

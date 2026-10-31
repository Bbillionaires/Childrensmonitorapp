"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { SchoolSeatInvitePreview } from "@app/types";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiFetch } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

/**
 * A parent following a school's email invite link. Deliberately outside the (dashboard)
 * layout group — a parent with no subscription at all must be able to reach and use this
 * page, which is exactly how one becomes entitled via a school seat (see
 * services/api/src/routes/school-invites.ts, kept ungated for the same reason).
 */
export default function SchoolInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { parent, loading } = useAuth();
  const [preview, setPreview] = useState<SchoolSeatInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    apiFetch<SchoolSeatInvitePreview>(`/api/parents/school-invites/${params.token}`)
      .then(setPreview)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong"));
  }, [params.token]);

  async function handleAccept() {
    setError(null);
    setAccepting(true);
    try {
      await apiFetch(`/api/parents/school-invites/${params.token}/accept`, { method: "POST" });
      setAccepted(true);
      setTimeout(() => router.replace("/children"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setAccepting(false);
    }
  }

  if (loading || (!preview && !error)) {
    return <p className="p-8 text-center text-sm text-slate-500">Loading…</p>;
  }

  if (error && !preview) {
    return (
      <AuthCard title="Invite not found" subtitle="This link may have expired or already been used">
        <p className="alert-error">{error}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={preview?.schoolName ?? "School invite"} subtitle="Sponsored Family Safety subscription">
      <div className="space-y-4">
        {error && <p className="alert-error">{error}</p>}
        {accepted ? (
          <p className="alert-success">You&apos;re all set — taking you to your dashboard…</p>
        ) : preview?.status !== "PENDING" ? (
          <p className="text-sm text-slate-600">This invite has already been used or is no longer available.</p>
        ) : !parent ? (
          <>
            <p className="text-sm text-slate-600">
              <strong>{preview?.schoolName}</strong> wants to sponsor your Family Safety subscription — no
              payment required. Sign in or create an account first, then come back to this link to accept.
            </p>
            <div className="flex gap-2">
              <Link href="/login" className="btn-primary flex-1 text-center">
                Sign in
              </Link>
              <Link href="/register" className="btn-secondary flex-1 text-center">
                Create account
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              <strong>{preview?.schoolName}</strong> wants to sponsor your Family Safety subscription for{" "}
              <strong>{parent.email}</strong> — no payment required.
            </p>
            <button onClick={() => void handleAccept()} disabled={accepting} className="btn-primary w-full">
              {accepting ? "Accepting…" : "Accept sponsored subscription"}
            </button>
          </>
        )}
      </div>
    </AuthCard>
  );
}

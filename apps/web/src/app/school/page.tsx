"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SchoolAccountSummary, SchoolSeatInviteSummary } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * Milestone 11's school admin dashboard — see SCHOOL_SEATS.md. Not wrapped in the parent
 * (dashboard) layout group (different session/identity entirely — SchoolAdminSessionClaims,
 * not ParentSessionClaims); this page checks its own auth inline via /api/schools/me rather
 * than sharing AuthProvider's /api/parents/me-based context.
 */
export default function SchoolDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SchoolAccountSummary | null>(null);
  const [invites, setInvites] = useState<SchoolSeatInviteSummary[] | null>(null);
  const [authError, setAuthError] = useState(false);
  const [seatCount, setSeatCount] = useState(10);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  async function loadAll() {
    try {
      const [summaryData, invitesData] = await Promise.all([
        apiFetch<SchoolAccountSummary>("/api/schools/me"),
        apiFetch<{ invites: SchoolSeatInviteSummary[] }>("/api/schools/invites"),
      ]);
      setSummary(summaryData);
      setInvites(invitesData.invites);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setAuthError(true);
      } else {
        throw err;
      }
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleCheckout(event: FormEvent) {
    event.preventDefault();
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/schools/checkout-session", {
        method: "POST",
        body: { seatCount },
      });
      window.location.href = url;
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError && err.statusCode === 503
          ? "Seat billing isn't available yet — the operator hasn't configured it."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong",
      );
      setCheckingOut(false);
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await apiFetch("/api/schools/invites", { method: "POST", body: { email: inviteEmail } });
      setInviteEmail("");
      await loadAll();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setInviting(false);
    }
  }

  if (authError) {
    router.replace("/school/login");
    return null;
  }

  if (!summary) {
    return <p className="p-8 text-center text-sm text-slate-500">Loading…</p>;
  }

  const entitled = summary.status === "ACTIVE" || summary.status === "TRIALING";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{summary.name}</h1>
        <p className="text-sm text-slate-500">
          Seats: {summary.seatsUsed} / {summary.seatCount} used · Status: {summary.status}
        </p>
      </div>

      {!entitled && (
        <div className="card space-y-3">
          <h2 className="font-medium text-slate-900">Purchase seats</h2>
          <p className="text-sm text-slate-600">
            Each seat sponsors one family&apos;s Family Safety subscription — no cost to the parent.
          </p>
          <form onSubmit={handleCheckout} className="flex items-end gap-2">
            <div>
              <label className="field-label" htmlFor="seatCount">Number of seats</label>
              <input
                id="seatCount"
                type="number"
                min={1}
                className="field-input w-32"
                value={seatCount}
                onChange={(e) => setSeatCount(Number(e.target.value))}
              />
            </div>
            <button type="submit" disabled={checkingOut} className="btn-primary">
              {checkingOut ? "Redirecting…" : "Continue to checkout"}
            </button>
          </form>
          {checkoutError && <p className="alert-error">{checkoutError}</p>}
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="font-medium text-slate-900">Invite a parent</h2>
        <form onSubmit={handleInvite} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="field-label" htmlFor="inviteEmail">Parent email</label>
            <input
              id="inviteEmail"
              type="email"
              className="field-input"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={inviting} className="btn-primary">
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>
        {inviteError && <p className="alert-error">{inviteError}</p>}
      </div>

      <div className="card">
        <h2 className="mb-2 font-medium text-slate-900">Invites</h2>
        {invites?.length === 0 && <p className="text-sm text-slate-500">No invites sent yet.</p>}
        <ul className="divide-y divide-slate-100">
          {invites?.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between py-2 text-sm">
              <span>{invite.email}</span>
              <span className="text-slate-500">{invite.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { setPinRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AccountPage() {
  const { parent, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!parent) return null;

  async function handleSetPin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = setPinRequestSchema.safeParse({ currentPassword, pin });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/parents/me/pin", { method: "POST", body: parsed.data });
      setSuccess("PIN updated.");
      setCurrentPassword("");
      setPin("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Account settings</h1>
        <p className="text-sm text-slate-500">Your login, security, and quick-switch PIN.</p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-900">Profile</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-900">{parent.displayName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900">{parent.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Two-factor authentication</dt>
            <dd className="text-slate-900">{parent.mfaEnabled ? "Enabled" : "Not enabled yet"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Quick-switch PIN</dt>
            <dd className="text-slate-900">{parent.pinConfigured ? "Set" : "Not set"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Subscription</dt>
            <dd className="text-slate-900">
              {parent.subscriptionStatus === "ACTIVE" && "Active"}
              {parent.subscriptionStatus === "TRIALING" && "Trial"}
              {parent.subscriptionStatus === "PAST_DUE" && "Past due — update your payment method"}
              {(parent.subscriptionStatus === "CANCELED" || parent.subscriptionStatus === "UNPAID") && "Canceled"}
              {(parent.subscriptionStatus === "INCOMPLETE" || parent.subscriptionStatus === null) && "Incomplete"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-900">Set your PIN</h2>
        <p className="mt-1 text-sm text-slate-500">
          A short PIN for quickly returning to the parent dashboard from a child&apos;s device — not a substitute for
          your password on a new device.
        </p>
        <form onSubmit={handleSetPin} className="mt-4 space-y-4">
          {error && <p className="alert-error">{error}</p>}
          {success && <p className="alert-success">{success}</p>}
          <div>
            <label className="field-label" htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              type="password"
              className="field-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="pin">New PIN (4–8 digits)</label>
            <input
              id="pin"
              inputMode="numeric"
              className="field-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving…" : "Save PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}

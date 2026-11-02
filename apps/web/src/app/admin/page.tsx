"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AdminSubscriberSummary } from "@app/types";
import { createSubscriberRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";

export default function AdminSubscribersPage() {
  const [subscribers, setSubscribers] = useState<AdminSubscriberSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendingLinkFor, setSendingLinkFor] = useState<string | null>(null);
  const [sentLinks, setSentLinks] = useState<Record<string, string>>({});

  async function loadSubscribers(query?: string) {
    const params = query ? `?search=${encodeURIComponent(query)}` : "";
    const data = await apiFetch<{ subscribers: AdminSubscriberSummary[] }>(`/api/admin/subscribers${params}`);
    setSubscribers(data.subscribers);
  }

  useEffect(() => {
    void loadSubscribers();
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await loadSubscribers(search);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = createSubscriberRequestSchema.safeParse({ displayName, email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setCreating(true);
    try {
      await apiFetch("/api/admin/subscribers", { method: "POST", body: parsed.data });
      setDisplayName("");
      setEmail("");
      setSuccess(`Account created for ${parsed.data.email} — a set-password email was sent.`);
      await loadSubscribers(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendPaymentLink(parentAccountId: string) {
    setSendingLinkFor(parentAccountId);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/admin/subscribers/${parentAccountId}/payment-link`, {
        method: "POST",
      });
      setSentLinks((prev) => ({ ...prev, [parentAccountId]: url }));
    } finally {
      setSendingLinkFor(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Subscribers</h1>
        <p className="text-sm text-slate-500">
          Manually add a subscriber, send them a payment link, or manage their account.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Add a subscriber</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <p className="alert-error">{error}</p>}
          {success && <p className="alert-success">{success}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="displayName">Name</label>
              <input
                id="displayName"
                className="field-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={creating} className="btn-primary">
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          className="field-input"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary whitespace-nowrap">Search</button>
      </form>

      {subscribers === null && <p className="text-sm text-slate-500">Loading…</p>}
      {subscribers?.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">No subscribers found.</p>
        </div>
      )}

      <div className="space-y-3">
        {subscribers?.map((subscriber) => (
          <div key={subscriber.parentAccountId} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/admin/subscribers/${subscriber.parentAccountId}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {subscriber.displayName}
              </Link>
              <p className="text-xs text-slate-500">
                {subscriber.email} · {subscriber.childCount} child{subscriber.childCount === 1 ? "" : "ren"} ·{" "}
                {subscriber.subscriptionStatus ?? "No subscription"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                className="btn-secondary"
                disabled={sendingLinkFor === subscriber.parentAccountId}
                onClick={() => void handleSendPaymentLink(subscriber.parentAccountId)}
              >
                {sendingLinkFor === subscriber.parentAccountId ? "Sending…" : "Send payment link"}
              </button>
              {sentLinks[subscriber.parentAccountId] && (
                <p className="max-w-xs truncate text-xs text-slate-500">
                  Sent: {sentLinks[subscriber.parentAccountId]}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

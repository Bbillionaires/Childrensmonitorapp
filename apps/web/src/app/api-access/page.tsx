"use client";

import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

/**
 * Public signup for the commercial Supervision Score API (Milestone 10) — see
 * COMMERCIAL_API.md. Unlike /subscribe, this needs no parent login at all: a business
 * customer is a completely separate identity space (ApiClient), authenticated only by the API
 * key issued once payment succeeds.
 */
export default function ApiAccessPage() {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { checkoutUrl } = await apiFetch<{ apiClientId: string; checkoutUrl: string }>("/api/v1/clients", {
        method: "POST",
        body: { name, contactEmail },
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(
        err instanceof ApiError && err.statusCode === 503
          ? "API access isn't available yet — the operator hasn't configured billing."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong",
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Supervision Score API"
      subtitle="License our content-safety scoring engine for your own product"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="alert-error">{error}</p>}
        <div>
          <label className="field-label" htmlFor="name">Company / project name</label>
          <input
            id="name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="contactEmail">Contact email</label>
          <input
            id="contactEmail"
            type="email"
            className="field-input"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Redirecting to checkout…" : "Continue to checkout"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Your API key is emailed to you once your subscription activates.
        </p>
      </form>
    </AuthCard>
  );
}

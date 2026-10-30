"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiFetch } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

/**
 * The paywall every parent lands on until services/api's requireActiveSubscription preHandler
 * sees an ACTIVE/TRIALING ParentSubscription row — see (dashboard)/layout.tsx's redirect here.
 * The actual price is set in Stripe (STRIPE_PARENT_PRICE_ID), never hardcoded in this page.
 */
export default function SubscribePage() {
  const { parent, loading, logout } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setError(null);
    setSubmitting(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/checkout-session", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError && err.statusCode === 503
          ? "Subscriptions aren't available yet — the operator hasn't configured billing."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong",
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-sm text-slate-500">Loading…</p>;
  }

  if (!parent) {
    router.replace("/login");
    return null;
  }

  if (parent.subscriptionStatus === "ACTIVE" || parent.subscriptionStatus === "TRIALING") {
    router.replace("/children");
    return null;
  }

  return (
    <AuthCard title="Subscribe" subtitle={`Hi ${parent.displayName}, one more step before your dashboard`}>
      <div className="space-y-4">
        {error && <p className="alert-error">{error}</p>}
        <p className="text-sm text-slate-600">
          Family Safety requires an active subscription. Approve a plan to unlock your dashboard —
          child profiles, approved content, Supervision Scores, and everything else.
        </p>
        <button onClick={() => void handleSubscribe()} disabled={submitting} className="btn-primary w-full">
          {submitting ? "Redirecting to checkout…" : "Subscribe"}
        </button>
        <button onClick={() => void logout()} className="w-full text-center text-sm text-slate-400 hover:underline">
          Sign out
        </button>
      </div>
    </AuthCard>
  );
}

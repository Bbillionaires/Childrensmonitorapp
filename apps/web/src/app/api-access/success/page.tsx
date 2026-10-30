"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { apiFetch } from "@/lib/api";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~1 minute

/**
 * Stripe Checkout redirects here with ?apiClientId=... (see billing-service.ts's
 * signUpApiClient). The webhook that actually issues the API key (billing-service.ts's
 * applySubscriptionEvent) is asynchronous, so this polls a status endpoint rather than
 * expecting the key to exist yet — the raw key itself is never shown here or returned by any
 * endpoint; it's emailed once, the same "shown once, never again" discipline as every other
 * secret in this app.
 */
export default function ApiAccessSuccessPage() {
  const searchParams = useSearchParams();
  const apiClientId = searchParams.get("apiClientId");
  const [status, setStatus] = useState<"waiting" | "ready" | "timeout" | "missing">(
    apiClientId ? "waiting" : "missing",
  );

  useEffect(() => {
    if (!apiClientId) return;
    let attempts = 0;
    let cancelled = false;

    async function poll() {
      try {
        const result = await apiFetch<{ status: string; hasKey: boolean }>(
          `/api/v1/clients/${apiClientId}/key-status`,
        );
        if (cancelled) return;
        if (result.hasKey) {
          setStatus("ready");
          return;
        }
      } catch {
        // Keep polling — a transient failure shouldn't immediately show "timeout".
      }

      attempts += 1;
      if (attempts >= MAX_POLLS) {
        if (!cancelled) setStatus("timeout");
        return;
      }
      setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [apiClientId]);

  return (
    <AuthCard title="Supervision Score API" subtitle="Setting up your account">
      <div className="space-y-4 text-center text-sm text-slate-600">
        {status === "missing" && <p className="alert-error">Missing client reference — check your confirmation link.</p>}
        {status === "waiting" && <p>Activating your subscription and issuing your API key…</p>}
        {status === "ready" && (
          <p className="alert-success">
            You&apos;re all set — check <strong>your inbox</strong> for an email with your API key.
          </p>
        )}
        {status === "timeout" && (
          <p className="alert-error">
            This is taking longer than expected. If payment succeeded, your key will still arrive by
            email shortly — otherwise, please try signing up again.
          </p>
        )}
      </div>
    </AuthCard>
  );
}

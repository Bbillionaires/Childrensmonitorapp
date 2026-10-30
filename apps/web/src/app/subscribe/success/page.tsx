"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AuthCard } from "@/components/auth-card";

/**
 * Stripe redirects here right after Checkout completes — but the webhook that actually
 * activates the subscription (see services/api/src/routes/billing.ts) is asynchronous and may
 * land a moment after this page does. Re-checking /api/parents/me once on mount (via
 * useAuth's refresh) picks up ACTIVE status as soon as it's there; the dashboard layout itself
 * re-redirects to /subscribe if it still isn't by the time the parent clicks through.
 */
export default function SubscribeSuccessPage() {
  const { refresh } = useAuth();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthCard title="Thank you!" subtitle="Your subscription is being activated">
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">
          This usually takes only a few seconds. If your dashboard still asks you to subscribe,
          wait a moment and try again.
        </p>
        <Link href="/children" className="btn-primary inline-flex w-full justify-center">
          Go to my dashboard
        </Link>
      </div>
    </AuthCard>
  );
}

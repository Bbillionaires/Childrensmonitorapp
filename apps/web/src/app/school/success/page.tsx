"use client";

import Link from "next/link";
import { AuthCard } from "@/components/auth-card";

/**
 * Stripe redirects here after a school's seat checkout completes — the webhook that actually
 * activates the SchoolAccount (see billing-service.ts's applySubscriptionEvent) is
 * asynchronous, same pattern as /subscribe/success and /api-access/success.
 */
export default function SchoolCheckoutSuccessPage() {
  return (
    <AuthCard title="Thank you!" subtitle="Your seats are being activated">
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">
          This usually takes only a few seconds. If your dashboard still shows no seats, wait a
          moment and refresh.
        </p>
        <Link href="/school" className="btn-primary inline-flex w-full justify-center">
          Go to my dashboard
        </Link>
      </div>
    </AuthCard>
  );
}

"use client";

import Link from "next/link";
import { ChildSessionProvider, useChildSession } from "@/lib/child-session-context";
import { ExitToParentBar } from "@/components/exit-to-parent-bar";

function ChildGate({ children }: { children: React.ReactNode }) {
  const { child, loading } = useChildSession();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  if (!child) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="card max-w-sm">
          <p className="text-sm text-slate-600">
            This device isn&apos;t set up for a child right now. Ask a parent to open this for you.
          </p>
          <Link href="/login" className="btn-primary mt-4 inline-flex">
            Parent sign-in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50/40">
      <ExitToParentBar childName={child.firstName} />
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}

export default function ChildLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChildSessionProvider>
      <ChildGate>{children}</ChildGate>
    </ChildSessionProvider>
  );
}

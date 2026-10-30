"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChildSessionProvider, useChildSession } from "@/lib/child-session-context";
import { useTvBackKey, useTvSpatialNav } from "@/lib/tv-nav";
import { TvExitKeypad } from "@/components/tv-exit-keypad";

/**
 * 10-foot UI for the same child session/library/playback backend as /child — a TV sits across
 * the room, so everything here is larger (text, touch/focus targets) and navigated with a
 * remote's D-pad instead of touch or a mouse. See apps/web/src/lib/tv-nav.ts for how arrow-key
 * navigation works and IMPLEMENTATION_PLAN.md's Milestone 9 section for why this, rather than a
 * native TV app, is what's actually buildable and verifiable in this environment.
 */
function TvGate({ children }: { children: ReactNode }) {
  const { child, loading } = useChildSession();
  const router = useRouter();
  const [showExit, setShowExit] = useState(false);

  useTvSpatialNav();
  useTvBackKey(() => router.back());

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-2xl text-slate-400">
        Loading…
      </div>
    );
  }

  if (!child) {
    return (
      <main className="flex min-h-screen items-center justify-center px-8 text-center">
        <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
          <p className="text-xl text-slate-600">
            This TV isn&apos;t set up for a child right now. Ask a parent to open this from their
            device.
          </p>
          <Link
            href="/login"
            data-tv-focusable
            className="btn-primary mt-6 inline-flex text-lg focus:outline-none focus:ring-4 focus:ring-brand-300"
          >
            Parent sign-in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-10 py-6">
        <span className="text-2xl font-bold">Hi, {child.firstName}!</span>
        <button
          data-tv-focusable
          onClick={() => setShowExit(true)}
          className="rounded-xl border-2 border-slate-700 px-4 py-2 text-sm text-slate-400 focus:border-brand-400 focus:text-white focus:outline-none"
        >
          🔒 Parent sign-in
        </button>
      </header>
      <main className="px-10 pb-16">{children}</main>
      {showExit && <TvExitKeypad onClose={() => setShowExit(false)} />}
    </div>
  );
}

export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <ChildSessionProvider>
      <TvGate>{children}</TvGate>
    </ChildSessionProvider>
  );
}

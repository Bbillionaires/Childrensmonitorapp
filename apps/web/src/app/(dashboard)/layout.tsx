"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS } from "@/components/dashboard-nav";

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5 px-3">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {item.label}
            {item.status === "soon" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                SOON
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { parent, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // The API is the real gate (every /api/parents/* route requires a parent session and
  // checks resource ownership — see ARCHITECTURE.md); this redirect is just so an
  // unauthenticated visitor doesn't see an empty dashboard shell flash by.
  useEffect(() => {
    if (!loading && !parent) {
      router.replace("/login");
    }
  }, [loading, parent, router]);

  // Same reasoning, for the subscription paywall (Milestone 10): services/api's
  // requireActiveSubscription preHandler is the real gate on every route here — this is just
  // so a logged-in-but-unpaid parent sees /subscribe instead of a dashboard full of 402s.
  useEffect(() => {
    if (!loading && parent && parent.subscriptionStatus !== "ACTIVE" && parent.subscriptionStatus !== "TRIALING") {
      router.replace("/subscribe");
    }
  }, [loading, parent, router]);

  // A navigation from the mobile drawer should close it, same as tapping outside would.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const entitled = parent?.subscriptionStatus === "ACTIVE" || parent?.subscriptionStatus === "TRIALING";

  if (loading || !parent || !entitled) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  async function handleSignOut() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      {/* Mobile top bar — the sidebar below is hidden under sm:, so without this a parent on a
          phone would have no way to navigate between sections at all. */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Family Safety</p>
          <p className="truncate text-xs text-slate-500">{parent.displayName}</p>
        </div>
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
        >
          {menuOpen ? (
            <span className="text-xl leading-none">✕</span>
          ) : (
            <span className="flex flex-col gap-1">
              <span className="block h-0.5 w-5 bg-slate-600" />
              <span className="block h-0.5 w-5 bg-slate-600" />
              <span className="block h-0.5 w-5 bg-slate-600" />
            </span>
          )}
        </button>
      </header>
      {menuOpen && (
        <div className="border-b border-slate-200 bg-white pb-3 sm:hidden">
          <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          <div className="px-3 pt-2">
            <button onClick={() => void handleSignOut()} className="btn-secondary w-full">
              Sign out
            </button>
          </div>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white sm:block">
        <div className="px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Family Safety</p>
          <p className="mt-1 truncate text-sm text-slate-500">{parent.displayName}</p>
        </div>
        <NavLinks pathname={pathname} />
        <div className="px-3 pt-4">
          <button onClick={() => void handleSignOut()} className="btn-secondary w-full">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}

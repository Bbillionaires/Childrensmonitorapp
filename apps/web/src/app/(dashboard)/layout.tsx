"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS } from "@/components/dashboard-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { parent, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // The API is the real gate (every /api/parents/* route requires a parent session and
  // checks resource ownership — see ARCHITECTURE.md); this redirect is just so an
  // unauthenticated visitor doesn't see an empty dashboard shell flash by.
  useEffect(() => {
    if (!loading && !parent) {
      router.replace("/login");
    }
  }, [loading, parent, router]);

  if (loading || !parent) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white sm:block">
        <div className="px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Family Safety</p>
          <p className="mt-1 truncate text-sm text-slate-500">{parent.displayName}</p>
        </div>
        <nav className="space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
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
        <div className="px-3 pt-4">
          <button onClick={() => void logout().then(() => router.push("/login"))} className="btn-secondary w-full">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}

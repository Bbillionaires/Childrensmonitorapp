"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminAuthProvider, useAdminAuth } from "@/lib/admin-auth-context";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Subscribers" },
  { href: "/admin/curated-playlists", label: "Curated Playlists" },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, loading, logout } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  // The API is the real gate on every /api/admin/* route — this redirect is just so an
  // unauthenticated visitor doesn't see an empty console shell flash by, same reasoning as
  // (dashboard)/layout.tsx's parent-facing redirect.
  useEffect(() => {
    if (pathname === "/admin/login") return;
    if (!loading && !admin) {
      router.replace("/admin/login");
    }
  }, [loading, admin, pathname, router]);

  if (pathname === "/admin/login") return <>{children}</>;

  if (loading || !admin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  async function handleSignOut() {
    await logout();
    router.push("/admin/login");
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white sm:w-64 sm:border-b-0 sm:border-r">
        <div className="px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Admin Console</p>
          <p className="mt-1 truncate text-sm text-slate-500">{admin.email}</p>
        </div>
        <nav className="space-y-0.5 px-3">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";

export function ExitToParentBar({ childName }: { childName: string }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/child/exit-to-parent", { method: "POST", body: { pin } });
      window.location.href = "/children";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">Hi, {childName}!</span>
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            🔒 Parent sign-in
          </button>
          {open && (
            <div className="absolute right-0 top-8 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              <form onSubmit={handleSubmit} className="space-y-3">
                {error && <p className="alert-error text-xs">{error}</p>}
                <div>
                  <label className="field-label text-xs" htmlFor="exit-pin">Parent PIN</label>
                  <input
                    id="exit-pin"
                    inputMode="numeric"
                    className="field-input"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? "Checking…" : "Switch to parent"}
                </button>
                <p className="text-center text-xs text-slate-500">
                  <Link href="/login" className="text-brand-600 hover:underline">
                    Use password instead
                  </Link>
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

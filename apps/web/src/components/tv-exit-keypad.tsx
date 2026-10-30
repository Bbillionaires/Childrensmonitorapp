"use client";

import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Enter"];

/**
 * A TV remote has no reliable text input, so exiting to parent mode on /tv uses an on-screen
 * numeric keypad (D-pad navigable, same [data-tv-focusable] convention as everything else)
 * instead of apps/web's phone/desktop text-input popover (exit-to-parent-bar.tsx). Same
 * `/api/child/exit-to-parent` endpoint and PIN rules (4-8 digits) either way.
 */
export function TvExitKeypad({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (pin.length < 4) {
      setError("Enter at least 4 digits");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/child/exit-to-parent", { method: "POST", body: { pin } });
      window.location.href = "/children";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  function press(key: string) {
    if (key === "Clear") {
      setPin("");
      setError(null);
    } else if (key === "Enter") {
      void submit();
    } else if (pin.length < 8) {
      setPin((p) => p + key);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-800">Parent PIN</h2>
        <p className="mt-2 text-lg tracking-[0.5em] text-slate-600">
          {pin.padEnd(4, "•").split("").map((c, i) => (i < pin.length ? "●" : "·")).join(" ")}
        </p>
        {error && <p className="alert-error mt-2">{error}</p>}

        <div className="mt-6 grid grid-cols-3 gap-3">
          {KEYS.map((key) => (
            <button
              key={key}
              data-tv-focusable
              disabled={submitting}
              onClick={() => press(key)}
              className="rounded-2xl border-2 border-slate-200 bg-slate-50 py-4 text-xl font-semibold text-slate-700 focus:border-brand-600 focus:bg-brand-50 focus:outline-none"
            >
              {key === "Enter" ? "✓" : key === "Clear" ? "⌫" : key}
            </button>
          ))}
        </div>

        <button
          data-tv-focusable
          onClick={onClose}
          className="mt-6 text-sm text-slate-400 underline-offset-2 focus:text-slate-700 focus:underline focus:outline-none"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

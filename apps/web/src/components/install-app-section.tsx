"use client";

import { useEffect, useState } from "react";

/** Not in lib.dom.d.ts yet — this is the real shape Chrome/Edge dispatch. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState = "checking" | "installed" | "promptable" | "ios" | "manual";

/**
 * There's no real downloadable app for any platform (see apps/mobile and apps/tv's own
 * READMEs — unbuilt scaffolds, nothing compiled). What's genuinely real today: the manifest +
 * icons already shipped in Milestone 8 make this site installable as-is, confirmed directly
 * against Chrome's own installability check (zero errors) — no service worker required, no
 * app store, no review. This component surfaces that real capability rather than promising
 * anything that doesn't exist yet.
 */
export function InstallAppSection() {
  const [state, setState] = useState<InstallState>("checking");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [result, setResult] = useState<"accepted" | "dismissed" | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setState("installed");
      return;
    }

    // beforeinstallprompt never fires on iOS Safari (no automated install flow exists there) —
    // detected so iOS gets real manual instructions instead of a button that will never work.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      setState("ios");
      return;
    }

    // Chrome/Edge (desktop and Android) fire this when the page meets installability criteria.
    // Until it fires, fall back to "manual" (browser-menu instructions) rather than an inert
    // button — Firefox and others never fire this event at all.
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setState("promptable");
    };
    window.addEventListener("beforeinstallprompt", handler);
    const fallbackTimer = setTimeout(() => {
      setState((current) => (current === "checking" ? "manual" : current));
    }, 2000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(fallbackTimer);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setResult(outcome);
    setDeferredPrompt(null);
    if (outcome === "accepted") setState("installed");
  }

  if (state === "installed") {
    return (
      <div className="card w-full max-w-xl text-left">
        <p className="text-sm font-medium text-slate-900">You already have the app installed on this device.</p>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-xl text-left">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">Get the app</h2>
      <p className="mt-1 text-sm text-slate-600">
        No app store, no download file — install it straight from your browser on your phone, tablet, or
        computer.
      </p>

      {state === "checking" && <p className="mt-4 text-sm text-slate-500">Checking what your browser supports…</p>}

      {state === "promptable" && (
        <div className="mt-4">
          <button type="button" onClick={() => void handleInstallClick()} className="btn-primary">
            Install app
          </button>
          {result === "dismissed" && (
            <p className="mt-2 text-xs text-slate-500">
              No problem — you can install any time from your browser&apos;s menu.
            </p>
          )}
        </div>
      )}

      {state === "ios" && (
        <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-slate-700">
          <li>
            Open this page in <strong>Safari</strong> (not Chrome — iOS only allows Safari to install).
          </li>
          <li>
            Tap the <strong>Share</strong> icon.
          </li>
          <li>
            Tap <strong>Add to Home Screen</strong>.
          </li>
        </ol>
      )}

      {state === "manual" && (
        <p className="mt-4 text-sm text-slate-700">
          Look for <strong>Install app</strong> (desktop: in the address bar) or <strong>Add to Home Screen</strong>{" "}
          in your browser&apos;s menu.
        </p>
      )}
    </div>
  );
}

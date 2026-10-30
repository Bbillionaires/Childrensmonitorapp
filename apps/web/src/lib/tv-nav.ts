"use client";

import { useEffect, type RefObject } from "react";

/** Mark any element a TV remote's D-pad should be able to land on. */
export const TV_FOCUSABLE_SELECTOR = "[data-tv-focusable]";

function getCenter(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

/**
 * Minimal spatial navigation for TV remotes (Tizen/webOS/Android TV browsers all deliver
 * D-pad presses as real ArrowUp/Down/Left/Right KeyboardEvents — this is what makes a web app
 * remote-navigable at all). Arrow keys move focus to the nearest `[data-tv-focusable]` element
 * in that direction, using actual element positions rather than a hardcoded grid shape, so it
 * works for any layout (a card grid, a row of buttons, a numeric keypad) without each page
 * doing its own column-count math.
 *
 * Deliberately does NOT handle Enter/Space activation — a real `<button>` or `<a>` already
 * does that natively once focused, which is also what a real TV browser relies on. Reimplementing
 * it here would be an unverified guess at behavior the platform already provides for free.
 */
export function useTvSpatialNav() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const direction = DIRECTIONS[event.key];
      if (!direction) return;

      const candidates = Array.from(document.querySelectorAll<HTMLElement>(TV_FOCUSABLE_SELECTOR));
      const first = candidates[0];
      if (!first) return;

      const current = document.activeElement;
      if (!(current instanceof HTMLElement) || !current.matches(TV_FOCUSABLE_SELECTOR)) {
        first.focus();
        event.preventDefault();
        return;
      }

      const from = getCenter(current);
      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const candidate of candidates) {
        if (candidate === current) continue;
        const to = getCenter(candidate);
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        // Must be (mostly) in the pressed direction, not behind or exactly sideways of it.
        const alongAxis = direction.dx !== 0 ? dx * direction.dx : dy * direction.dy;
        if (alongAxis <= 0) continue;

        // Penalize drifting off the perpendicular axis so navigation stays roughly in-line
        // (e.g. ArrowDown from a card prefers the card directly below it, not a diagonal one).
        const perpendicular = direction.dx !== 0 ? Math.abs(dy) : Math.abs(dx);
        const distance = Math.hypot(dx, dy);
        const score = distance + perpendicular * 2;

        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (best) {
        best.focus();
        best.scrollIntoView({ block: "nearest", inline: "nearest" });
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Every page navigation resets `document.activeElement` to `<body>`, and the header's "Parent
 * sign-in" button is always first in DOM order (it's rendered by the layout, above every
 * page's own content) — so without this, the first arrow press on any freshly-loaded page
 * would always jump focus there instead of into that page's actual content. Call this once a
 * page's real content has rendered (include it in `deps`, e.g. `[library]`) to focus the first
 * `[data-tv-focusable]` *inside* `containerRef` specifically, so a remote user lands somewhere
 * useful immediately rather than needing to arrow down from the account menu every time.
 */
export function useTvAutoFocus(containerRef: RefObject<HTMLElement>, deps: unknown[]) {
  useEffect(() => {
    containerRef.current?.querySelector<HTMLElement>(TV_FOCUSABLE_SELECTOR)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * The "Back" button on a real TV remote (or a TV browser's own back gesture) delivers a
 * Backspace or Escape key. `onBack` is typically `router.back()`.
 */
export function useTvBackKey(onBack: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Backspace" || event.key === "Escape") {
        event.preventDefault();
        onBack();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);
}

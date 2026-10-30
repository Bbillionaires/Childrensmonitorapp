import { generateOpaqueToken, hashOpaqueToken } from "./opaque-tokens.js";

/**
 * Commercial Supervision Score API keys (Milestone 10) — same "opaque random token, only its
 * hash is ever stored" pattern as refresh/password-reset tokens (see opaque-tokens.ts): a
 * leaked database dump alone must never be replayable as a live key. The `fsk_live_` prefix
 * (Family Safety Key) exists only so a key is recognizable at a glance in logs/support
 * requests, the same convention Stripe/GitHub/etc. use for their own keys.
 */
const API_KEY_PREFIX = "fsk_live_";

export interface GeneratedApiKey {
  /** The full raw key — shown to the customer exactly once at issuance, never stored. */
  rawKey: string;
  /** The raw key's own first several characters — not secret on its own, safe to store for
   *  display ("key ending in ...") without ever being able to reconstruct the full key from it. */
  keyPrefix: string;
  /** SHA-256 hash of the full raw key — what's actually persisted (ApiKey.keyHash) for
   *  verification on each request. */
  keyHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const rawKey = `${API_KEY_PREFIX}${generateOpaqueToken()}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, API_KEY_PREFIX.length + 8),
    keyHash: hashOpaqueToken(rawKey),
  };
}

export function hashApiKey(rawKey: string): string {
  return hashOpaqueToken(rawKey);
}

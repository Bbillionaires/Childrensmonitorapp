import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Refresh tokens and password-reset tokens are opaque random strings, never JWTs: the
 * server must be able to revoke one by deleting/marking its DB row, which only works if
 * possession of the token requires a database lookup rather than just a valid signature.
 * Only the SHA-256 hash is stored (see RefreshToken.tokenHash / PasswordResetToken.tokenHash
 * in packages/database) so a leaked database dump alone can't be replayed as a live token.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

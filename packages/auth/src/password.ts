import * as argon2 from "argon2";

/**
 * Argon2id is memory-hard and the current OWASP recommendation for password storage —
 * see SECURITY_AND_PRIVACY.md. Never swap this for a faster hash "for performance"; the
 * whole point is that it's expensive to brute-force.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // A malformed/foreign hash format should fail closed, not throw past the caller.
    return false;
  }
}

/** Same primitive, reused for the parent's quick-switch PIN (see SECURITY_AND_PRIVACY.md). */
export const hashPin = hashPassword;
export const verifyPin = verifyPassword;

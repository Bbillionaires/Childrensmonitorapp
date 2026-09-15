import jwt from "jsonwebtoken";
import { type SessionClaims, sessionClaimsSchema } from "@app/types";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes — see SECURITY_AND_PRIVACY.md

export interface AccessTokenConfig {
  secret: string;
  issuer?: string;
}

/**
 * Signs a short-lived access token carrying exactly the session's role + ownership claims
 * (never a password hash, never child PII beyond an opaque childId) — see the AuthN section
 * of SECURITY_AND_PRIVACY.md.
 */
export function signAccessToken(claims: SessionClaims, config: AccessTokenConfig): string {
  return jwt.sign(claims, config.secret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: config.issuer ?? "childrensmonitorapp",
  });
}

export class InvalidSessionTokenError extends Error {
  constructor(message = "Invalid or expired session token") {
    super(message);
    this.name = "InvalidSessionTokenError";
  }
}

export function verifyAccessToken(token: string, config: AccessTokenConfig): SessionClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, config.secret, {
      issuer: config.issuer ?? "childrensmonitorapp",
    });
  } catch {
    throw new InvalidSessionTokenError();
  }

  const result = sessionClaimsSchema.safeParse(decoded);
  if (!result.success) {
    throw new InvalidSessionTokenError("Session token claims failed validation");
  }
  return result.data;
}

export const ACCESS_TOKEN_TTL = ACCESS_TOKEN_TTL_SECONDS;

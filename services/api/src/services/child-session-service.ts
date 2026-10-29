import { prisma } from "@app/database";
import { signAccessToken } from "@app/auth";
import type { Env } from "@app/config";
import type { ChildSessionClaims } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";
import { AuthError, issueSessionForUser, verifyParentPin, type IssuedSession } from "./auth-service.js";

/**
 * A device-handoff session is deliberately bounded (a few hours, not indefinite) since a
 * child has no way to silently refresh it the way a parent's browser does — see
 * ARCHITECTURE.md's AuthN/AuthZ model and packages/auth's `expiresInSeconds` option.
 */
export const CHILD_SESSION_TTL_SECONDS = 6 * 60 * 60;

export interface ChildDeviceSession {
  accessToken: string;
  expiresInSeconds: number;
}

/**
 * The only way a CHILD-role token is ever minted: a parent, already authenticated, hands
 * the device to a specific one of their own children. The caller (routes/parents.ts) then
 * overwrites the browser's session cookie with this token via
 * session-cookies.ts#setChildSessionCookies, which also clears the parent's own refresh
 * token — the parent's session genuinely ends here, it doesn't just get hidden.
 */
export async function startChildDeviceSession(
  env: Env,
  parentAccountId: string,
  actorUserId: string,
  childId: string,
): Promise<ChildDeviceSession> {
  const child = await prisma.child.findFirst({ where: { id: childId, parentAccountId, archivedAt: null } });
  if (!child) throw new NotFoundError("Child not found");

  // Clearing the refresh_token *cookie* (session-cookies.ts) isn't enough on its own — the
  // underlying row stays valid in the database until revoked, and an httpOnly cookie is
  // still visible to anyone with devtools/physical access to the device, which is exactly
  // the threat model here. Revoking it server-side means a captured token can't be replayed
  // against /api/auth/refresh to mint a fresh parent session after handoff.
  await prisma.refreshToken.updateMany({
    where: { userId: actorUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const claims: ChildSessionClaims = { role: "CHILD", childId, parentAccountId };
  const accessToken = signAccessToken(claims, {
    secret: env.JWT_ACCESS_SECRET,
    expiresInSeconds: CHILD_SESSION_TTL_SECONDS,
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "CHILD_DEVICE_SESSION_STARTED",
    targetType: "Child",
    targetId: childId,
  });

  return { accessToken, expiresInSeconds: CHILD_SESSION_TTL_SECONDS };
}

/**
 * "Parent PIN ... for quick re-authentication when switching between the parent dashboard
 * and a child's device session" — PRODUCT_REQUIREMENTS.md. Requires an active child session
 * to even attempt (routes/child.ts gates this behind requireChildSession), so a PIN can't be
 * probed without first holding a legitimate child-mode browser. A parent who never set a PIN
 * (or gets it wrong) isn't locked out — they can always fall back to a normal /login.
 */
export async function exitToParentSession(
  env: Env,
  childClaims: ChildSessionClaims,
  pin: string,
): Promise<IssuedSession> {
  const parentAccount = await prisma.parentAccount.findUnique({
    where: { id: childClaims.parentAccountId },
    include: { user: true },
  });
  if (!parentAccount) throw new AuthError("Account not found", 404);

  const valid = await verifyParentPin(parentAccount.user.id, pin);
  if (!valid) {
    throw new AuthError("Incorrect PIN — sign in with your password instead", 401);
  }

  await writeAuditLog(prisma, {
    actorUserId: parentAccount.user.id,
    actorRole: "PARENT",
    action: "PARENT_SESSION_RESUMED_VIA_PIN",
    targetType: "User",
    targetId: parentAccount.user.id,
  });

  return issueSessionForUser(env, parentAccount.user.id, "Resumed via child-mode PIN");
}

import { prisma } from "@app/database";
import { generateOpaqueToken, hashOpaqueToken, signAccessToken, verifyPassword } from "@app/auth";
import type { Env } from "@app/config";
import type { AdminSessionClaims } from "@app/types";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — same as every other role's

export class AdminAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface IssuedAdminSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Mirrors school-auth-service.ts's issueSchoolAdminSession, minus even the profile-table
 * include that needs — an admin IS User.role === "ADMIN", no separate profile row to join.
 */
async function issueAdminSession(env: Env, userId: string): Promise<IssuedAdminSession> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "ADMIN") {
    throw new AdminAuthError("Account is not fully set up", 500);
  }

  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashOpaqueToken(refreshToken), expiresAt: refreshTokenExpiresAt },
  });

  const claims: AdminSessionClaims = { role: "ADMIN", userId: user.id };
  const accessToken = signAccessToken(claims, { secret: env.JWT_ACCESS_SECRET });

  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

/**
 * No public registration — admins are provisioned only by prisma/seed.ts from
 * ADMIN_BOOTSTRAP_EMAIL/ADMIN_BOOTSTRAP_PASSWORD. See ADMIN_CONSOLE.md.
 */
export async function loginAdmin(env: Env, input: { email: string; password: string }): Promise<IssuedAdminSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.role !== "ADMIN") {
    throw new AdminAuthError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw new AdminAuthError("Invalid email or password", 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return issueAdminSession(env, user.id);
}

/**
 * The refresh token is validated against *this* account type specifically — presenting a
 * parent's or school admin's refresh token here fails loudly (issueAdminSession's
 * role !== "ADMIN" check) rather than silently issuing an admin session for the wrong user,
 * the same reasoning apps/web/src/lib/api.ts's refreshEndpointFor comment documents for why
 * each role rotates against its own endpoint.
 */
export async function refreshAdminSession(env: Env, refreshToken: string): Promise<IssuedAdminSession> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  // Role membership checked before rotating — see auth-service.ts's refreshSession for why a
  // cross-role refresh attempt must fail without burning the token it was never meant for.
  if (!existing || existing.revokedAt || existing.expiresAt < new Date() || existing.user.role !== "ADMIN") {
    throw new AdminAuthError("Invalid or expired session", 401);
  }

  // Rotate: the presented token is single-use, same as every other role's.
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  return issueAdminSession(env, existing.userId);
}

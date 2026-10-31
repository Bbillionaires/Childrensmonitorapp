import { prisma } from "@app/database";
import { generateOpaqueToken, hashOpaqueToken, hashPassword, signAccessToken, verifyPassword } from "@app/auth";
import type { Env } from "@app/config";
import type { SchoolAdminSessionClaims } from "@app/types";
import { writeAuditLog } from "./audit.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — same as a parent's

export class SchoolAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "SchoolAuthError";
  }
}

export interface IssuedSchoolSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Mirrors auth-service.ts's issueSessionForUser, minus the Device row a parent/child login
 * always creates — a school admin never has a device-handoff model, only a login session, and
 * RefreshToken.deviceId is nullable for exactly this kind of caller.
 */
async function issueSchoolAdminSession(env: Env, userId: string): Promise<IssuedSchoolSession> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { schoolAdminAccount: true } });
  if (!user?.schoolAdminAccount) {
    throw new SchoolAuthError("Account is not fully set up", 500);
  }

  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashOpaqueToken(refreshToken), expiresAt: refreshTokenExpiresAt },
  });

  const claims: SchoolAdminSessionClaims = {
    role: "SCHOOL_ADMIN",
    userId: user.id,
    schoolAccountId: user.schoolAdminAccount.schoolAccountId,
  };
  const accessToken = signAccessToken(claims, { secret: env.JWT_ACCESS_SECRET });

  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

/**
 * Creates the User + SchoolAdminAccount + a brand-new SchoolAccount (status INCOMPLETE,
 * seatCount 0 until the admin purchases seats — see school-service.ts) in one transaction.
 * SchoolAccount.contactEmail is unique the same way ApiClient.contactEmail is, so a school
 * can't accidentally end up with two billing identities for the same inbox.
 */
export async function registerSchoolAdmin(
  env: Env,
  input: { schoolName: string; adminName: string; email: string; password: string },
): Promise<IssuedSchoolSession> {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    throw new SchoolAuthError("Unable to create account with the provided details", 409);
  }
  const existingSchool = await prisma.schoolAccount.findUnique({ where: { contactEmail: input.email } });
  if (existingSchool) {
    throw new SchoolAuthError("Unable to create account with the provided details", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: "SCHOOL_ADMIN",
      schoolAdminAccount: {
        create: {
          schoolAccount: { create: { name: input.schoolName, contactEmail: input.email } },
        },
      },
    },
  });

  await writeAuditLog(prisma, {
    actorUserId: user.id,
    actorRole: "SCHOOL_ADMIN",
    action: "SCHOOL_ACCOUNT_REGISTERED",
    targetType: "User",
    targetId: user.id,
    metadata: { schoolName: input.schoolName },
  });

  return issueSchoolAdminSession(env, user.id);
}

export async function refreshSchoolAdminSession(env: Env, refreshToken: string): Promise<IssuedSchoolSession> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new SchoolAuthError("Invalid or expired session", 401);
  }

  // Rotate: the presented token is single-use, same as a parent's.
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  return issueSchoolAdminSession(env, existing.userId);
}

export async function loginSchoolAdmin(
  env: Env,
  input: { email: string; password: string },
): Promise<IssuedSchoolSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: { schoolAdminAccount: true } });
  if (!user?.schoolAdminAccount) {
    throw new SchoolAuthError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw new SchoolAuthError("Invalid email or password", 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return issueSchoolAdminSession(env, user.id);
}

import { prisma } from "@app/database";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  hashPin,
  signAccessToken,
  verifyPassword,
  verifyPin,
} from "@app/auth";
import type { Env } from "@app/config";
import type { ParentSessionClaims } from "@app/types";
import { writeAuditLog } from "./audit.js";
import type { EmailSender } from "./email.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  parentAccountId: string;
}

async function issueSessionForUser(env: Env, userId: string, deviceLabel: string): Promise<IssuedSession> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { parentAccount: true },
  });
  if (!user?.parentAccount) {
    throw new AuthError("Account is not fully set up", 500);
  }

  const device = await prisma.device.create({
    data: {
      parentAccountId: user.parentAccount.id,
      label: deviceLabel,
      platform: "WEB",
      lastSeenAt: new Date(),
    },
  });

  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      deviceId: device.id,
      tokenHash: hashOpaqueToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    },
  });

  const claims: ParentSessionClaims = {
    role: "PARENT",
    userId: user.id,
    parentAccountId: user.parentAccount.id,
  };
  const accessToken = signAccessToken(claims, { secret: env.JWT_ACCESS_SECRET });

  return { accessToken, refreshToken, refreshTokenExpiresAt, parentAccountId: user.parentAccount.id };
}

export async function registerParent(
  env: Env,
  input: { email: string; password: string; displayName: string },
): Promise<IssuedSession> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Deliberately vague — does not confirm which detail was wrong, to avoid account
    // enumeration via the registration endpoint.
    throw new AuthError("Unable to create account with the provided details", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: "PARENT",
      parentAccount: {
        create: { displayName: input.displayName },
      },
    },
  });

  await writeAuditLog(prisma, {
    actorUserId: user.id,
    actorRole: "PARENT",
    action: "PARENT_ACCOUNT_REGISTERED",
    targetType: "User",
    targetId: user.id,
  });

  return issueSessionForUser(env, user.id, "Registration browser session");
}

export async function loginParent(
  env: Env,
  input: { email: string; password: string },
): Promise<IssuedSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AuthError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw new AuthError("Invalid email or password", 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return issueSessionForUser(env, user.id, "Login browser session");
}

export async function refreshSession(env: Env, refreshToken: string): Promise<IssuedSession> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new AuthError("Invalid or expired session", 401);
  }

  // Rotate: the presented token is single-use.
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  return issueSessionForUser(env, existing.userId, "Refreshed browser session");
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const tokenHash = hashOpaqueToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestPasswordReset(
  emailSender: EmailSender,
  email: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always behave identically whether or not the account exists, so this endpoint cannot be
  // used to enumerate registered emails.
  if (!user) return;

  const token = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  await emailSender.send({
    to: user.email,
    subject: "Reset your password",
    html: `<p>Use this code to reset your password. It expires in 15 minutes and can only be used once:</p><p><code>${token}</code></p>`,
  });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new AuthError("Invalid or expired reset token", 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    // A password reset invalidates every existing session — a leaked old password should not
    // leave a live session usable after the owner has reset it.
    prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAuditLog(prisma, {
    actorUserId: resetToken.userId,
    actorRole: "PARENT",
    action: "PASSWORD_RESET_COMPLETED",
    targetType: "User",
    targetId: resetToken.userId,
  });
}

export async function setParentPin(userId: string, currentPassword: string, pin: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError("Account not found", 404);

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) throw new AuthError("Current password is incorrect", 401);

  const pinHash = await hashPin(pin);
  await prisma.user.update({ where: { id: userId }, data: { pinHash } });

  await writeAuditLog(prisma, {
    actorUserId: userId,
    actorRole: "PARENT",
    action: "PARENT_PIN_UPDATED",
    targetType: "User",
    targetId: userId,
  });
}

export async function verifyParentPin(userId: string, pin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pinHash) return false;
  return verifyPin(user.pinHash, pin);
}

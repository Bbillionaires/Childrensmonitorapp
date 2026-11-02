import { prisma } from "@app/database";
import { generateOpaqueToken, hashPassword } from "@app/auth";
import type { Env } from "@app/config";
import type { StripeBillingClient } from "@app/billing";
import type { AdminChildSummary, AdminSubscriberSummary } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";
import { requestPasswordReset } from "./auth-service.js";
import { createParentCheckoutSession } from "./billing-service.js";
import type { EmailSender } from "./email.js";

export class AdminServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "AdminServiceError";
  }
}

export async function listSubscribers(search?: string): Promise<AdminSubscriberSummary[]> {
  const parentAccounts = await prisma.parentAccount.findMany({
    where: search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: { user: true, subscription: true, _count: { select: { children: true } } },
    orderBy: { createdAt: "desc" },
  });

  return parentAccounts.map((account) => ({
    parentAccountId: account.id,
    userId: account.userId,
    displayName: account.displayName,
    email: account.user.email,
    subscriptionStatus: account.subscription?.status ?? null,
    childCount: account._count.children,
    createdAt: account.createdAt.toISOString(),
  }));
}

/**
 * Mirrors auth-service.ts's registerParent, minus the password the admin would otherwise
 * have to choose on the subscriber's behalf: the random password here is hashed and
 * immediately forgotten — nobody (not even this admin) ever sees it — and
 * requestPasswordReset sends the new parent the same set-password email a self-service
 * registration never needed, since this account didn't go through one.
 */
export async function createSubscriber(
  env: Env,
  emailSender: EmailSender,
  adminUserId: string,
  input: { displayName: string; email: string },
): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AdminServiceError("Unable to create account with the provided details", 409);
  }

  const passwordHash = await hashPassword(generateOpaqueToken());
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: "PARENT",
      parentAccount: { create: { displayName: input.displayName } },
    },
    include: { parentAccount: true },
  });

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "SUBSCRIBER_CREATED_BY_ADMIN",
    targetType: "User",
    targetId: user.id,
    metadata: { email: input.email },
  });

  await requestPasswordReset(emailSender, input.email);

  return user.parentAccount!.id;
}

/**
 * Generates a Stripe Checkout payment link and emails it to the subscriber — the admin
 * console never collects a card number itself (see ADMIN_CONSOLE.md). Reuses
 * createParentCheckoutSession directly so the first-subscription trial-eligibility check
 * (and every other parent-checkout rule) stays in exactly one place, not reimplemented here.
 */
export async function createPaymentLink(
  env: Env,
  billingClient: StripeBillingClient | undefined,
  emailSender: EmailSender,
  adminUserId: string,
  parentAccountId: string,
): Promise<string> {
  const parentAccount = await prisma.parentAccount.findUnique({
    where: { id: parentAccountId },
    include: { user: true },
  });
  if (!parentAccount) throw new NotFoundError("Subscriber not found");

  const url = await createParentCheckoutSession(env, billingClient, parentAccountId, parentAccount.user.email);

  await emailSender.send({
    to: parentAccount.user.email,
    subject: "Complete your Family Safety subscription",
    html: `
      <p>An administrator has set up a Family Safety subscription for you. Complete payment securely through Stripe at the link below — we never see or store your card details.</p>
      <p><a href="${url}">${url}</a></p>
    `,
  });

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "PAYMENT_LINK_SENT",
    targetType: "ParentAccount",
    targetId: parentAccountId,
  });

  return url;
}

/**
 * Comps a subscriber in directly — no Stripe session, no trial clock, no card ever involved.
 * Upserts the ParentSubscription row straight to ACTIVE; stripeCustomerId is required/unique
 * on that model but a comped account has no real Stripe customer, so it gets a clearly-marked
 * sentinel value instead of a fabricated-looking real one. requireActiveSubscription only ever
 * checks `status` (see isSubscriptionEntitled), so this is honored everywhere a real paid
 * subscription would be, with nothing elsewhere needing to know the difference.
 */
export async function grantFreeAccess(adminUserId: string, parentAccountId: string): Promise<void> {
  const parentAccount = await prisma.parentAccount.findUnique({ where: { id: parentAccountId } });
  if (!parentAccount) throw new NotFoundError("Subscriber not found");

  await prisma.parentSubscription.upsert({
    where: { parentAccountId },
    update: { status: "ACTIVE" },
    create: {
      parentAccountId,
      stripeCustomerId: `comped_${parentAccountId}`,
      status: "ACTIVE",
    },
  });

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "FREE_ACCESS_GRANTED_BY_ADMIN",
    targetType: "ParentAccount",
    targetId: parentAccountId,
  });
}

export async function listParentChildren(parentAccountId: string): Promise<AdminChildSummary[]> {
  const children = await prisma.child.findMany({
    where: { parentAccountId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return children.map((child) => ({ id: child.id, firstName: child.firstName }));
}

/**
 * Scoped to the specific (parentAccountId, playlistId) pair given — a playlist/item that
 * exists but belongs to a different parent account 404s exactly like a parent's own
 * ownership checks elsewhere (see parents.ts's doc comment), so an admin acting on one
 * subscriber can never reach into another's data through a mismatched id.
 */
export async function removePlaylistItem(
  adminUserId: string,
  parentAccountId: string,
  playlistId: string,
  playlistItemId: string,
): Promise<void> {
  const item = await prisma.playlistItem.findFirst({
    where: { id: playlistItemId, playlistId, playlist: { ownerParentAccountId: parentAccountId } },
  });
  if (!item) throw new NotFoundError("Playlist item not found");

  await prisma.playlistItem.delete({ where: { id: playlistItemId } });

  await writeAuditLog(prisma, {
    actorUserId: adminUserId,
    actorRole: "ADMIN",
    action: "PLAYLIST_ITEM_REMOVED_BY_ADMIN",
    targetType: "PlaylistItem",
    targetId: playlistItemId,
    metadata: { parentAccountId, playlistId },
  });
}

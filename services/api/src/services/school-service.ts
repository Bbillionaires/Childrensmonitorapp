import { prisma } from "@app/database";
import { generateOpaqueToken, hashOpaqueToken } from "@app/auth";
import type { StripeBillingClient } from "@app/billing";
import type { Env } from "@app/config";
import type { SchoolAccountSummary, SchoolSeatInvitePreview, SchoolSeatInviteSummary } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";
import { BillingNotConfiguredError } from "./billing-service.js";
import type { EmailSender } from "./email.js";

const SEAT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SeatLimitExceededError extends Error {
  constructor() {
    super("This school has no remaining seats — purchase more seats or revoke an existing invite first");
    this.name = "SeatLimitExceededError";
  }
}

export class InviteAlreadyResolvedError extends Error {}
export class InviteExpiredError extends Error {}
export class AlreadyOnASchoolError extends Error {
  constructor() {
    super("This parent account is already linked to a school");
    this.name = "AlreadyOnASchoolError";
  }
}

function requireClient(billingClient: StripeBillingClient | undefined): StripeBillingClient {
  if (!billingClient) throw new BillingNotConfiguredError();
  return billingClient;
}

async function seatsInUse(schoolAccountId: string): Promise<number> {
  return prisma.schoolSeatInvite.count({
    where: { schoolAccountId, status: { in: ["PENDING", "ACCEPTED"] } },
  });
}

export async function getSchoolAccountSummary(schoolAccountId: string): Promise<SchoolAccountSummary> {
  const school = await prisma.schoolAccount.findUniqueOrThrow({ where: { id: schoolAccountId } });
  const used = await seatsInUse(schoolAccountId);
  return {
    id: school.id,
    name: school.name,
    contactEmail: school.contactEmail,
    status: school.status,
    seatCount: school.seatCount,
    seatsUsed: used,
  };
}

/**
 * A school buying (or changing) its seat count. Safe to call again later to resize — Stripe
 * Checkout just starts a new subscription for the new quantity; this app doesn't yet support
 * resizing an *existing* live subscription's quantity in place (no route for it), only ever
 * starting one, the same scope the parent/api_client tiers started with.
 */
export async function createSchoolCheckoutSession(
  env: Env,
  billingClient: StripeBillingClient | undefined,
  schoolAccountId: string,
  contactEmail: string,
  seatCount: number,
): Promise<string> {
  const client = requireClient(billingClient);
  if (!env.STRIPE_SCHOOL_PRICE_ID) {
    throw new Error("STRIPE_SCHOOL_PRICE_ID is not configured");
  }
  if (!env.STRIPE_SCHOOL_BASE_PRICE_ID) {
    throw new Error("STRIPE_SCHOOL_BASE_PRICE_ID is not configured");
  }

  // Two independent line items on one subscription: the per-seat price (multiplied by
  // seatCount) and a flat monthly platform fee (quantity 1) — see billing-service.ts's school
  // branch of applySubscriptionEvent for how the webhook tells them apart afterward.
  const session = await client.createCheckoutSession({
    priceId: env.STRIPE_SCHOOL_PRICE_ID,
    customerEmail: contactEmail,
    successUrl: `${env.WEB_APP_ORIGIN}/school/success`,
    cancelUrl: `${env.WEB_APP_ORIGIN}/school`,
    ownerKind: "school",
    ownerId: schoolAccountId,
    quantity: seatCount,
    additionalLineItem: { priceId: env.STRIPE_SCHOOL_BASE_PRICE_ID },
  });

  return session.url;
}

export async function listSchoolSeatInvites(schoolAccountId: string): Promise<SchoolSeatInviteSummary[]> {
  const invites = await prisma.schoolSeatInvite.findMany({
    where: { schoolAccountId },
    orderBy: { createdAt: "desc" },
  });
  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
  }));
}

/**
 * Enforces the seat limit at invite time (clear, immediate feedback for the admin) — and
 * acceptSchoolSeatInvite below re-checks it, since seats purchased can shrink between an
 * invite being sent and accepted (e.g. a subscription quantity decrease).
 */
export async function inviteParentToSchool(
  emailSender: EmailSender,
  env: Env,
  schoolAccountId: string,
  email: string,
): Promise<void> {
  const school = await prisma.schoolAccount.findUniqueOrThrow({ where: { id: schoolAccountId } });
  const used = await seatsInUse(schoolAccountId);
  if (used >= school.seatCount) {
    throw new SeatLimitExceededError();
  }

  const token = generateOpaqueToken();
  await prisma.schoolSeatInvite.create({
    data: {
      schoolAccountId,
      email,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + SEAT_INVITE_TTL_MS),
    },
  });

  await emailSender.send({
    to: email,
    subject: `${school.name} invited you to a sponsored Family Safety subscription`,
    html: `
      <p><strong>${school.name}</strong> has invited you to a sponsored parent account — no payment required.</p>
      <p>Click the link below (sign in or create an account first if you don't already have one) to accept:</p>
      <p><a href="${env.WEB_APP_ORIGIN}/school-invite/${token}">${env.WEB_APP_ORIGIN}/school-invite/${token}</a></p>
      <p>This invite expires in 7 days.</p>
    `,
  });

  await writeAuditLog(prisma, {
    actorRole: "SCHOOL_ADMIN",
    action: "SCHOOL_SEAT_INVITE_SENT",
    targetType: "SchoolAccount",
    targetId: schoolAccountId,
    metadata: { email },
  });
}

async function findInviteByToken(token: string) {
  const invite = await prisma.schoolSeatInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { schoolAccount: true },
  });
  if (!invite) throw new NotFoundError("Invite not found");
  return invite;
}

export async function previewSchoolSeatInvite(token: string): Promise<SchoolSeatInvitePreview> {
  const invite = await findInviteByToken(token);
  return { schoolName: invite.schoolAccount.name, status: invite.status };
}

/**
 * Links a parent's existing account to a school seat — the parent is never charged; their
 * entitlement from this point on derives from SchoolAccount.status (see
 * subscription-gate.ts), not a personal ParentSubscription. Re-checks both the invite's own
 * validity and the seat limit at the moment of acceptance, not just when it was sent.
 */
export async function acceptSchoolSeatInvite(parentAccountId: string, token: string): Promise<void> {
  const invite = await findInviteByToken(token);

  if (invite.status !== "PENDING") throw new InviteAlreadyResolvedError("This invite has already been used");
  if (invite.expiresAt < new Date()) {
    await prisma.schoolSeatInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    throw new InviteExpiredError("This invite has expired");
  }

  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parentAccountId } });
  if (parent.schoolAccountId) throw new AlreadyOnASchoolError();

  const used = await seatsInUse(invite.schoolAccountId);
  if (used >= invite.schoolAccount.seatCount) {
    throw new SeatLimitExceededError();
  }

  await prisma.$transaction([
    prisma.parentAccount.update({ where: { id: parentAccountId }, data: { schoolAccountId: invite.schoolAccountId } }),
    prisma.schoolSeatInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByParentAccountId: parentAccountId },
    }),
  ]);

  await writeAuditLog(prisma, {
    actorUserId: undefined,
    actorRole: "PARENT",
    action: "SCHOOL_SEAT_INVITE_ACCEPTED",
    targetType: "ParentAccount",
    targetId: parentAccountId,
    metadata: { schoolAccountId: invite.schoolAccountId },
  });
}

import { prisma } from "@app/database";
import type { ChildCreateRequest, ChildProfile, ChildUpdateRequest } from "@app/types";
import { writeAuditLog } from "./audit.js";
import { NotFoundError } from "../lib/errors.js";

export { NotFoundError };

function toChildProfile(child: {
  id: string;
  firstName: string;
  avatarUrl: string | null;
  ageRange: string | null;
  birthYear: number | null;
  interests: string[];
  contentCategories: string[];
  supervisionScoreMinimum: number;
  categoryThresholdOverrides: unknown;
  dailyLimitMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): ChildProfile {
  return {
    id: child.id,
    firstName: child.firstName,
    avatarUrl: child.avatarUrl,
    ageRange: child.ageRange as ChildProfile["ageRange"],
    birthYear: child.birthYear,
    interests: child.interests,
    contentCategories: child.contentCategories,
    supervisionScoreMinimum: child.supervisionScoreMinimum,
    categoryThresholdOverrides: child.categoryThresholdOverrides as ChildProfile["categoryThresholdOverrides"],
    dailyLimitMinutes: child.dailyLimitMinutes,
    createdAt: child.createdAt.toISOString(),
    updatedAt: child.updatedAt.toISOString(),
    archivedAt: child.archivedAt?.toISOString() ?? null,
  };
}

export async function listChildren(parentAccountId: string): Promise<ChildProfile[]> {
  const children = await prisma.child.findMany({
    where: { parentAccountId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return children.map(toChildProfile);
}

/** Ownership is checked in the same query — a child that belongs to another parent 404s. */
async function findOwnedChild(parentAccountId: string, childId: string) {
  const child = await prisma.child.findFirst({ where: { id: childId, parentAccountId } });
  if (!child) throw new NotFoundError("Child not found");
  return child;
}

export async function getChild(parentAccountId: string, childId: string): Promise<ChildProfile> {
  const child = await findOwnedChild(parentAccountId, childId);
  return toChildProfile(child);
}

export async function createChild(
  parentAccountId: string,
  actorUserId: string,
  input: ChildCreateRequest,
): Promise<ChildProfile> {
  const child = await prisma.child.create({
    data: {
      parentAccountId,
      firstName: input.firstName,
      avatarUrl: input.avatarUrl,
      ageRange: input.ageRange,
      birthYear: input.birthYear,
      interests: input.interests,
      contentCategories: input.contentCategories,
      supervisionScoreMinimum: input.supervisionScoreMinimum,
      categoryThresholdOverrides: input.categoryThresholdOverrides,
      dailyLimitMinutes: input.dailyLimitMinutes,
    },
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "CHILD_PROFILE_CREATED",
    targetType: "Child",
    targetId: child.id,
    metadata: { firstName: child.firstName },
  });

  return toChildProfile(child);
}

export async function updateChild(
  parentAccountId: string,
  actorUserId: string,
  childId: string,
  input: ChildUpdateRequest,
): Promise<ChildProfile> {
  await findOwnedChild(parentAccountId, childId);

  const child = await prisma.child.update({
    where: { id: childId },
    data: {
      firstName: input.firstName,
      avatarUrl: input.avatarUrl,
      ageRange: input.ageRange,
      birthYear: input.birthYear,
      interests: input.interests,
      contentCategories: input.contentCategories,
      supervisionScoreMinimum: input.supervisionScoreMinimum,
      categoryThresholdOverrides: input.categoryThresholdOverrides,
      dailyLimitMinutes: input.dailyLimitMinutes,
    },
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "CHILD_PROFILE_UPDATED",
    targetType: "Child",
    targetId: child.id,
    metadata: { fields: Object.keys(input) },
  });

  return toChildProfile(child);
}

export async function archiveChild(
  parentAccountId: string,
  actorUserId: string,
  childId: string,
): Promise<void> {
  await findOwnedChild(parentAccountId, childId);

  await prisma.child.update({ where: { id: childId }, data: { archivedAt: new Date() } });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "CHILD_PROFILE_ARCHIVED",
    targetType: "Child",
    targetId: childId,
  });
}

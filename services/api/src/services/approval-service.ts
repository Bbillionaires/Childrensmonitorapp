import { prisma } from "@app/database";
import type { ApprovalDecisionValue, BulkApprovalResultItem, ChildContentReviewItem } from "@app/types";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";
import { toContentSummary } from "./content-service.js";

async function assertOwnedChild(parentAccountId: string, childId: string): Promise<void> {
  const child = await prisma.child.findFirst({ where: { id: childId, parentAccountId } });
  if (!child) throw new NotFoundError("Child not found");
}

export type QueueFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

/**
 * Every piece of content this parent has ever submitted, annotated with this specific
 * child's decision on it (or null if undecided — that's what "Pending Reviews" filters on).
 * Approval is per (child, content) — see DATABASE_SCHEMA.md — so the same submitted content
 * can be pending for one child and already approved for another.
 */
export async function getChildContentQueue(
  parentAccountId: string,
  childId: string,
  filter: QueueFilter = "ALL",
): Promise<ChildContentReviewItem[]> {
  await assertOwnedChild(parentAccountId, childId);

  const submissions = await prisma.contentSubmission.findMany({
    where: { parentAccountId },
    include: {
      content: {
        include: {
          parentApprovals: { where: { childId } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const items: ChildContentReviewItem[] = submissions.map((submission) => {
    const approval = submission.content.parentApprovals[0];
    return {
      content: toContentSummary(submission.content),
      decision: (approval?.decision as ApprovalDecisionValue | undefined) ?? null,
      decidedAt: approval?.decidedAt.toISOString() ?? null,
      notes: approval?.notes ?? null,
    };
  });

  if (filter === "ALL") return items;
  if (filter === "PENDING") return items.filter((item) => item.decision === null);
  return items.filter((item) => item.decision === filter);
}

/**
 * The only function that can make content visible to a child (by creating a
 * ChildContentPermission row) or take it away (by deleting one) — see ARCHITECTURE.md's
 * "request flow" walkthrough. Runs in a transaction so a decision and its resulting
 * permission change are never observed half-applied.
 */
export async function decideApproval(
  parentAccountId: string,
  actorUserId: string,
  childId: string,
  contentId: string,
  decision: ApprovalDecisionValue,
  notes: string | undefined,
): Promise<void> {
  await assertOwnedChild(parentAccountId, childId);

  const submission = await prisma.contentSubmission.findUnique({
    where: { parentAccountId_contentId: { parentAccountId, contentId } },
  });
  if (!submission) {
    throw new NotFoundError("This content is not in your submission queue");
  }

  await prisma.$transaction(async (tx) => {
    const approval = await tx.parentApproval.upsert({
      where: { childId_contentId: { childId, contentId } },
      update: { decision, decidedAt: new Date(), decidedByUserId: actorUserId, notes },
      create: {
        parentAccountId,
        childId,
        contentId,
        decision,
        decidedByUserId: actorUserId,
        notes,
        source: "MANUAL",
      },
    });

    if (decision === "APPROVED") {
      await tx.childContentPermission.upsert({
        where: { childId_contentId: { childId, contentId } },
        update: { grantedViaId: approval.id, grantedAt: new Date() },
        create: { childId, contentId, grantedViaId: approval.id },
      });
    } else {
      await tx.childContentPermission.deleteMany({ where: { childId, contentId } });
    }
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: decision === "APPROVED" ? "CONTENT_APPROVED_FOR_CHILD" : "CONTENT_REJECTED_FOR_CHILD",
    targetType: "Content",
    targetId: contentId,
    metadata: { childId, notes: notes ?? null },
  });
}

/**
 * Powers the playlist-import "Select All / Approve Selected / Reject Selected" UI from
 * PRODUCT_REQUIREMENTS.md. Best-effort per item rather than all-or-nothing: if one of 40
 * selected videos was somehow removed from the queue between page load and submit, the
 * other 39 still go through — the caller surfaces which (if any) failed.
 */
export async function bulkDecideApproval(
  parentAccountId: string,
  actorUserId: string,
  childId: string,
  contentIds: string[],
  decision: ApprovalDecisionValue,
  notes: string | undefined,
): Promise<BulkApprovalResultItem[]> {
  await assertOwnedChild(parentAccountId, childId);

  const results: BulkApprovalResultItem[] = [];
  for (const contentId of contentIds) {
    try {
      await decideApproval(parentAccountId, actorUserId, childId, contentId, decision, notes);
      results.push({ contentId, ok: true });
    } catch (error) {
      results.push({
        contentId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return results;
}

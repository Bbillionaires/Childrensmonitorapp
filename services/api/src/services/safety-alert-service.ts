import { prisma, type Prisma } from "@app/database";
import { riskBandForScore } from "@app/supervision-score";
import type { AlertStatusValue, SafetyAlertItem, SupervisionScoreSummary } from "@app/types";
import { toContentSummary } from "./content-mapper.js";
import { attachSupervisionScores } from "./scoring-service.js";
import { decideApproval } from "./approval-service.js";
import { NotFoundError } from "../lib/errors.js";

type AlertWithRelations = Prisma.SafetyAlertGetPayload<{
  include: {
    content: true;
    child: { select: { id: true; firstName: true; parentAccountId: true } };
    previousScoreVersion: { include: { categoryResults: { include: { safetyCategory: true } } } };
    newScoreVersion: { include: { categoryResults: { include: { safetyCategory: true } } } };
  };
}>;

function versionToSummary(
  version: AlertWithRelations["previousScoreVersion"],
): SupervisionScoreSummary | null {
  if (!version) return null;
  return {
    modelVersion: version.modelVersion,
    overallScore: version.overallScore,
    confidence: version.confidence,
    riskBand: riskBandForScore(version.overallScore),
    explanation: version.explanation,
    analyzedAt: version.analyzedAt.toISOString(),
    categories: version.categoryResults
      .map((result) => ({
        categoryId: result.safetyCategoryId,
        displayName: result.safetyCategory.displayName,
        score: result.score,
        confidence: result.confidence,
        detectedFactors: result.detectedFactors as string[],
      }))
      .sort((a, b) => a.score - b.score),
  };
}

/**
 * Every alert for this parent's children, newest first — both OPEN ones awaiting a decision
 * and already-resolved ones kept for history/transparency (the UI distinguishes them, see
 * apps/web's alerts page). See PRODUCT_REQUIREMENTS.md's "Safety alerts" section.
 */
export async function listAlertsForParent(parentAccountId: string): Promise<SafetyAlertItem[]> {
  const rows = await prisma.safetyAlert.findMany({
    where: { child: { parentAccountId } },
    include: {
      content: true,
      child: { select: { id: true, firstName: true, parentAccountId: true } },
      previousScoreVersion: { include: { categoryResults: { include: { safetyCategory: true } } } },
      newScoreVersion: { include: { categoryResults: { include: { safetyCategory: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  // Every alert this engine raises sets childId (see raiseSafetyAlertsForRescore) — the
  // schema allows a content-wide, childless alert for a future use case, but nothing creates
  // one yet, and there's nothing this per-child page could show for it anyway.
  const alerts = rows.filter((row): row is AlertWithRelations & { child: NonNullable<AlertWithRelations["child"]> } =>
    row.child !== null,
  );

  const contentSummaries = await attachSupervisionScores(alerts.map((alert) => toContentSummary(alert.content)));

  return alerts.map((alert, index) => ({
    id: alert.id,
    alertType: alert.alertType,
    status: alert.status,
    createdAt: alert.createdAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    content: contentSummaries[index]!,
    child: { id: alert.child.id, firstName: alert.child.firstName },
    previousScore: versionToSummary(alert.previousScoreVersion),
    newScore: versionToSummary(alert.newScoreVersion),
  }));
}

/**
 * "Keep Approved" leaves the `ChildContentPermission` untouched and just closes the alert.
 * "Remove" reuses `decideApproval` — the single code path that can revoke a
 * `ChildContentPermission` — so a removal via an alert is indistinguishable, audit-wise, from
 * any other parent rejection; the alert itself is the record of *why*.
 */
export async function resolveAlert(
  parentAccountId: string,
  actorUserId: string,
  alertId: string,
  resolution: Extract<AlertStatusValue, "KEPT_APPROVED" | "REMOVED">,
): Promise<void> {
  const alert = await prisma.safetyAlert.findFirst({
    where: { id: alertId, child: { parentAccountId } },
  });
  if (!alert) throw new NotFoundError("Safety alert not found");
  if (alert.status !== "OPEN") throw new NotFoundError("This alert has already been resolved");
  if (!alert.childId) throw new NotFoundError("This alert has no associated child to act on");

  if (resolution === "REMOVED") {
    await decideApproval(parentAccountId, actorUserId, alert.childId, alert.contentId, "REJECTED", undefined, "MANUAL");
  }

  await prisma.safetyAlert.update({
    where: { id: alertId },
    data: { status: resolution, resolvedAt: new Date(), resolvedByUserId: actorUserId },
  });
}

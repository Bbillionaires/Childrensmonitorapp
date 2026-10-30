import { prisma, type Prisma } from "@app/database";
import { RuleBasedSupervisionScorer, riskBandForScore, type RiskBand } from "@app/supervision-score";
import type { ContentSummary, SupervisionScoreSummary } from "@app/types";
import { toContentSummary } from "./content-mapper.js";
import { writeAuditLog } from "./audit.js";

const scorer = new RuleBasedSupervisionScorer();

const RISK_BAND_RANK: Record<RiskBand, number> = { LOW: 3, MODERATE: 2, ELEVATED: 1, HIGH: 0 };

/**
 * Computes this content's score and persists it as a new `ScoreVersion` — the content's first
 * one if it has never been scored, or an appended one (never an in-place edit, per
 * SUPERVISION_SCORE.md's versioning rules) if re-running the scorer against the content's
 * *current* metadata produces a different result than what's on file. `Content` is shared
 * globally across every family (see its doc comment in DATABASE_SCHEMA.md), so a piece of
 * content is scored once per distinct result, not once per parent who happens to submit it.
 *
 * A re-score happens here (not on a timer or a separate trigger) because this is called again
 * every time `upsertVideoContent` refreshes an existing Content row's metadata (playlist
 * re-import, re-submitting the same URL) — a creator editing a video's title/description is
 * the realistic source of "new safety information" this milestone can act on; nothing here
 * fabricates a change that didn't actually happen to the content's own metadata. When a
 * re-score produces a worse result for a child who currently has this content approved,
 * `raiseSafetyAlertsForRescore` below notifies that parent rather than silently changing what
 * the child can still see.
 */
export async function ensureContentScored(contentId: string): Promise<void> {
  const existing = await prisma.supervisionScore.findUnique({
    where: { contentId },
    include: { currentScoreVersion: { include: { categoryResults: true } } },
  });

  const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
  const result = await scorer.score({
    content: {
      id: content.id,
      title: content.title,
      description: content.description,
      durationSeconds: content.durationSeconds,
      creatorName: content.creatorName,
    },
    providerMadeForKids: content.providerMadeForKids,
  });

  if (existing && scoreUnchanged(existing.currentScoreVersion, result)) return;

  const newVersionId = await prisma.$transaction(async (tx) => {
    const scoreVersion = await tx.scoreVersion.create({
      data: {
        contentId,
        modelVersion: result.modelVersion,
        overallScore: result.overallScore,
        confidence: result.confidence,
        signalsUsed: result.signalsUsed as Prisma.InputJsonValue,
        explanation: result.explanation,
        previousScoreVersionId: existing?.currentScoreVersionId,
      },
    });

    await tx.scoreCategoryResult.createMany({
      data: result.categories.map((category) => ({
        scoreVersionId: scoreVersion.id,
        safetyCategoryId: category.categoryId,
        score: category.score,
        confidence: category.confidence,
        detectedFactors: category.detectedFactors as Prisma.InputJsonValue,
      })),
    });

    if (existing) {
      await tx.supervisionScore.update({ where: { contentId }, data: { currentScoreVersionId: scoreVersion.id } });
    } else {
      await tx.supervisionScore.create({ data: { contentId, currentScoreVersionId: scoreVersion.id } });
    }

    return scoreVersion.id;
  });

  if (existing) {
    await raiseSafetyAlertsForRescore(contentId, existing.currentScoreVersionId, newVersionId);
  }
}

function scoreUnchanged(
  current: Prisma.ScoreVersionGetPayload<{ include: { categoryResults: true } }>,
  result: Awaited<ReturnType<RuleBasedSupervisionScorer["score"]>>,
): boolean {
  if (current.overallScore !== result.overallScore) return false;
  if (current.categoryResults.length !== result.categories.length) return false;
  const byCategory = new Map(current.categoryResults.map((c) => [c.safetyCategoryId, c]));
  return result.categories.every((category) => {
    const stored = byCategory.get(category.categoryId);
    return (
      stored !== undefined &&
      stored.score === category.score &&
      JSON.stringify(stored.detectedFactors) === JSON.stringify(category.detectedFactors)
    );
  });
}

/**
 * "When previously approved content receives new safety information, the parent is notified
 * and chooses: Keep Approved, Remove, or Review Details. Content is never silently removed" —
 * PRODUCT_REQUIREMENTS.md. Only children who currently hold a `ChildContentPermission` for
 * this content are in scope — a re-score of content nobody has approved yet has nothing to
 * notify anyone about. An alert is raised only when the change is actually worse for that
 * specific child: its risk band dropped, or it crossed below that child's own
 * `supervisionScoreMinimum` floor (two different, both legitimate, "new safety information"
 * events) — an improved or unchanged-for-this-child score never generates an alert.
 */
async function raiseSafetyAlertsForRescore(
  contentId: string,
  previousScoreVersionId: string,
  newScoreVersionId: string,
): Promise<void> {
  const [previous, next] = await Promise.all([
    prisma.scoreVersion.findUniqueOrThrow({ where: { id: previousScoreVersionId } }),
    prisma.scoreVersion.findUniqueOrThrow({ where: { id: newScoreVersionId } }),
  ]);
  const previousBand = riskBandForScore(previous.overallScore);
  const nextBand = riskBandForScore(next.overallScore);

  const permissions = await prisma.childContentPermission.findMany({
    where: { contentId },
    include: { child: { select: { id: true, supervisionScoreMinimum: true } } },
  });

  for (const permission of permissions) {
    const { child } = permission;
    const bandWorsened = RISK_BAND_RANK[nextBand] < RISK_BAND_RANK[previousBand];
    const crossedBelowFloor = next.overallScore < child.supervisionScoreMinimum && previous.overallScore >= child.supervisionScoreMinimum;
    if (!bandWorsened && !crossedBelowFloor) continue;

    await prisma.safetyAlert.create({
      data: {
        contentId,
        childId: child.id,
        alertType: "SCORE_DROPPED",
        previousScoreVersionId,
        newScoreVersionId,
      },
    });

    await writeAuditLog(prisma, {
      actorRole: "SYSTEM",
      action: "SAFETY_ALERT_RAISED",
      targetType: "Content",
      targetId: contentId,
      metadata: {
        childId: child.id,
        previousScore: previous.overallScore,
        newScore: next.overallScore,
        previousBand,
        newBand: nextBand,
      },
    });
  }
}

function toSummary(
  version: Prisma.ScoreVersionGetPayload<{ include: { categoryResults: { include: { safetyCategory: true } } } }>,
): SupervisionScoreSummary {
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
      // Worst (most informative to a parent deciding) first.
      .sort((a, b) => a.score - b.score),
  };
}

/**
 * Batched enrichment — one query regardless of list size — rather than scoring lookups
 * per-item in a loop. Content that isn't scored yet (shouldn't normally happen, since
 * `ensureContentScored` runs synchronously at creation time) comes back with `null` rather
 * than blocking the caller on an on-demand score.
 */
export async function attachSupervisionScores(items: ContentSummary[]): Promise<ContentSummary[]> {
  if (items.length === 0) return items;

  const scores = await prisma.supervisionScore.findMany({
    where: { contentId: { in: items.map((item) => item.id) } },
    include: { currentScoreVersion: { include: { categoryResults: { include: { safetyCategory: true } } } } },
  });
  const byContentId = new Map(scores.map((score) => [score.contentId, toSummary(score.currentScoreVersion)]));

  return items.map((item) => ({ ...item, supervisionScore: byContentId.get(item.id) ?? null }));
}

/**
 * Powers the parent-facing Supervision Scores page: every piece of content approved for at
 * least one of this parent's children (the same "approved content" framing as the
 * Approved Content page, just scored and not split per child), each annotated with every
 * child it's approved for and its full score breakdown.
 */
export async function listApprovedContentWithScores(parentAccountId: string): Promise<
  { content: ContentSummary; approvedForChildren: { id: string; firstName: string }[] }[]
> {
  const approvals = await prisma.parentApproval.findMany({
    where: { parentAccountId, decision: "APPROVED" },
    include: { content: true, child: { select: { id: true, firstName: true } } },
    orderBy: { decidedAt: "desc" },
  });

  const byContentId = new Map<
    string,
    { content: (typeof approvals)[number]["content"]; approvedForChildren: { id: string; firstName: string }[] }
  >();
  for (const approval of approvals) {
    const entry = byContentId.get(approval.contentId) ?? { content: approval.content, approvedForChildren: [] };
    entry.approvedForChildren.push(approval.child);
    byContentId.set(approval.contentId, entry);
  }

  const entries = Array.from(byContentId.values());
  const scoredContent = await attachSupervisionScores(entries.map((entry) => toContentSummary(entry.content)));

  return entries.map((entry, index) => ({
    content: scoredContent[index]!,
    approvedForChildren: entry.approvedForChildren,
  }));
}

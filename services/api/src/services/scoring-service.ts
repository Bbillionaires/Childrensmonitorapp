import { prisma, type Prisma } from "@app/database";
import { RuleBasedSupervisionScorer, riskBandForScore } from "@app/supervision-score";
import type { ContentSummary, SupervisionScoreSummary } from "@app/types";
import { toContentSummary } from "./content-mapper.js";

const scorer = new RuleBasedSupervisionScorer();

/**
 * Computes and persists this content's first `ScoreVersion` if it doesn't already have one.
 * `Content` is shared globally across every family (see its doc comment in
 * DATABASE_SCHEMA.md), so a piece of content is scored once, not once per parent who submits
 * it — scoring is a property of the content itself.
 *
 * Only ever creates here, never updates: nothing in this milestone yet triggers a re-score of
 * already-scored content (that lands with Milestone 7's richer signals, or an explicit
 * recalculation trigger) — see SUPERVISION_SCORE.md's versioning rules for how a re-score
 * will append a new `ScoreVersion` rather than edit this one in place.
 */
export async function ensureContentScored(contentId: string): Promise<void> {
  const existing = await prisma.supervisionScore.findUnique({ where: { contentId } });
  if (existing) return;

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

  await prisma.$transaction(async (tx) => {
    const scoreVersion = await tx.scoreVersion.create({
      data: {
        contentId,
        modelVersion: result.modelVersion,
        overallScore: result.overallScore,
        confidence: result.confidence,
        signalsUsed: result.signalsUsed as Prisma.InputJsonValue,
        explanation: result.explanation,
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

    await tx.supervisionScore.create({
      data: { contentId, currentScoreVersionId: scoreVersion.id },
    });
  });
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

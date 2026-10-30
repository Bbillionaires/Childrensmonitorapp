import { prisma } from "@app/database";
import type { ParentReportItem, ReportCategoryValue } from "@app/types";
import { toContentSummary } from "./content-mapper.js";
import { attachSupervisionScores } from "./scoring-service.js";
import { writeAuditLog } from "./audit.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * "Parents can report content for: inappropriate content, violence, sexual content,
 * disturbing imagery, grooming indicators, dangerous challenges, misleading age
 * classification, advertising, or other." — PRODUCT_REQUIREMENTS.md. A report can be made
 * against any content this parent has submitted (same ownership boundary as every other
 * content action), optionally tied to a specific child. Every report starts SUBMITTED — there
 * is no moderation/validation workflow in this product yet (no reviewer role exists), so
 * reports do not themselves trigger a re-score; see IMPLEMENTATION_PLAN.md for that boundary.
 */
export async function submitReport(
  parentAccountId: string,
  actorUserId: string,
  contentId: string,
  childId: string | undefined,
  category: ReportCategoryValue,
  details: string | undefined,
): Promise<void> {
  const submission = await prisma.contentSubmission.findUnique({
    where: { parentAccountId_contentId: { parentAccountId, contentId } },
  });
  if (!submission) throw new NotFoundError("This content is not in your submission queue");

  if (childId) {
    const child = await prisma.child.findFirst({ where: { id: childId, parentAccountId } });
    if (!child) throw new NotFoundError("Child not found");
  }

  await prisma.parentReport.create({
    data: { reportingParentAccountId: parentAccountId, contentId, childId, category, details },
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "CONTENT_REPORTED",
    targetType: "Content",
    targetId: contentId,
    metadata: { category, childId: childId ?? null },
  });
}

export async function listMyReports(parentAccountId: string): Promise<ParentReportItem[]> {
  const reports = await prisma.parentReport.findMany({
    where: { reportingParentAccountId: parentAccountId },
    include: { content: true },
    orderBy: { createdAt: "desc" },
  });

  const contentSummaries = await attachSupervisionScores(reports.map((report) => toContentSummary(report.content)));

  return reports.map((report, index) => ({
    id: report.id,
    category: report.category,
    status: report.status,
    details: report.details,
    createdAt: report.createdAt.toISOString(),
    content: contentSummaries[index]!,
  }));
}

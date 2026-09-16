import { prisma, type Prisma } from "@app/database";
import type { ContentSummary } from "@app/types";
import type { Env } from "@app/config";
import { getProviderRegistry } from "./provider-registry.js";
import { writeAuditLog } from "./audit.js";

interface ContentRow {
  id: string;
  providerId: string;
  contentType: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  creatorName: string | null;
  providerMadeForKids: boolean | null;
  createdAt: Date;
}

function toContentSummary(content: ContentRow): ContentSummary {
  return {
    id: content.id,
    providerId: content.providerId,
    contentType: content.contentType as ContentSummary["contentType"],
    sourceUrl: content.sourceUrl,
    title: content.title,
    description: content.description,
    thumbnailUrl: content.thumbnailUrl,
    durationSeconds: content.durationSeconds,
    creatorName: content.creatorName,
    providerMadeForKids: content.providerMadeForKids,
    createdAt: content.createdAt.toISOString(),
  };
}

/**
 * Resolves a submitted URL through the ContentProvider registry (see ARCHITECTURE.md).
 * A URL a registered adapter recognizes (e.g. a YouTube link) is fetched as a video through
 * that adapter's official API — never scraped. Anything no adapter recognizes falls back to
 * a website whitelist entry: no metadata is fetched or guessed for it, only its domain is
 * recorded, per SECURITY_AND_PRIVACY.md ("the API itself never renders arbitrary
 * parent-submitted HTML").
 *
 * Content is deduplicated globally by (providerId, providerRefId) — see the
 * ContentSubmission model — so re-submitting a URL another family already imported reuses
 * the existing row (refreshing its metadata) instead of re-fetching the provider API, while
 * still adding it to *this* parent's own submission queue.
 */
export async function submitContentUrl(
  env: Env,
  parentAccountId: string,
  actorUserId: string,
  rawUrl: string,
): Promise<ContentSummary> {
  const registry = getProviderRegistry(env);
  const adapter = registry.resolve(rawUrl);

  const content = adapter
    ? await (async () => {
        // Lets a ContentProviderNotConfiguredError (e.g. missing YOUTUBE_API_KEY) or a
        // provider fetch failure propagate to the caller untouched, rather than silently
        // falling back to treating a recognized video URL as a generic website.
        const metadata = await adapter.fetchVideoMetadata(rawUrl);
        const commonFields = {
          title: metadata.title,
          description: metadata.description,
          thumbnailUrl: metadata.thumbnailUrl,
          durationSeconds: metadata.durationSeconds,
          creatorName: metadata.creatorName,
          providerMadeForKids: metadata.providerMadeForKids,
          rawMetadata: metadata.rawMetadata as Prisma.InputJsonValue,
        };
        return prisma.content.upsert({
          where: {
            providerId_providerRefId: {
              providerId: metadata.providerId,
              providerRefId: metadata.providerRefId,
            },
          },
          update: commonFields,
          create: {
            ...commonFields,
            providerId: metadata.providerId,
            providerRefId: metadata.providerRefId,
            contentType: "VIDEO",
            sourceUrl: metadata.sourceUrl,
            firstImportedByParentAccountId: parentAccountId,
            video: { create: {} },
          },
        });
      })()
    : await (async () => {
        const parsed = new URL(rawUrl);
        const hostname = parsed.hostname.toLowerCase();
        const normalizedUrl = parsed.toString();
        return prisma.content.upsert({
          where: { providerId_providerRefId: { providerId: "website", providerRefId: normalizedUrl } },
          update: {},
          create: {
            providerId: "website",
            providerRefId: normalizedUrl,
            contentType: "WEBSITE",
            sourceUrl: normalizedUrl,
            title: hostname,
            firstImportedByParentAccountId: parentAccountId,
            website: { create: { allowedDomain: hostname } },
          },
        });
      })();

  await prisma.contentSubmission.upsert({
    where: { parentAccountId_contentId: { parentAccountId, contentId: content.id } },
    update: {},
    create: { parentAccountId, contentId: content.id, submittedByUserId: actorUserId },
  });

  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "PARENT",
    action: "CONTENT_SUBMITTED",
    targetType: "Content",
    targetId: content.id,
    metadata: { sourceUrl: rawUrl, contentType: content.contentType },
  });

  return toContentSummary(content);
}

export async function listSubmittedContent(parentAccountId: string): Promise<ContentSummary[]> {
  const submissions = await prisma.contentSubmission.findMany({
    where: { parentAccountId },
    include: { content: true },
    orderBy: { createdAt: "desc" },
  });
  return submissions.map((submission) => toContentSummary(submission.content));
}

export { toContentSummary };

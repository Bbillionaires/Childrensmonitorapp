import { prisma, type Prisma } from "@app/database";
import type { ContentSummary } from "@app/types";
import type { Env } from "@app/config";
import type { ProviderVideoMetadata } from "@app/content-providers";
import { getProviderRegistry } from "./provider-registry.js";
import { writeAuditLog } from "./audit.js";
import { toContentSummary, type ContentRow } from "./content-mapper.js";
import { ensureContentScored } from "./scoring-service.js";

/**
 * Upserts a Content+Video row from provider metadata. Shared by single-URL submission and
 * playlist import — both ultimately just need "make sure this video's metadata is in the
 * database," deduplicated globally by (providerId, providerRefId) per the Content model's
 * doc comment.
 */
async function upsertVideoContent(metadata: ProviderVideoMetadata, parentAccountId: string): Promise<ContentRow> {
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
}

async function upsertWebsiteContent(rawUrl: string, parentAccountId: string): Promise<ContentRow> {
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
}

/**
 * Adds a Content row to a parent's own submission queue — see ContentSubmission's doc
 * comment in DATABASE_SCHEMA.md for why this is a separate step from creating the Content
 * row itself. Idempotent, and audit-logged once per call (playlist import calls this once
 * per item, so a 40-item playlist writes 40 audit rows — intentional, since each is a
 * distinct "this parent added this specific thing" event).
 */
async function recordContentSubmission(
  parentAccountId: string,
  actorUserId: string,
  content: ContentRow,
  sourceUrl: string,
): Promise<void> {
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
    metadata: { sourceUrl, contentType: content.contentType },
  });
}

/**
 * Resolves a submitted URL through the ContentProvider registry (see ARCHITECTURE.md).
 * A URL a registered adapter recognizes (e.g. a YouTube link) is fetched as a video through
 * that adapter's official API — never scraped. Anything no adapter recognizes falls back to
 * a website whitelist entry: no metadata is fetched or guessed for it, only its domain is
 * recorded, per SECURITY_AND_PRIVACY.md ("the API itself never renders arbitrary
 * parent-submitted HTML").
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
    ? // Lets a ContentProviderNotConfiguredError (e.g. missing YOUTUBE_API_KEY) or a
      // provider fetch failure propagate to the caller untouched, rather than silently
      // falling back to treating a recognized video URL as a generic website.
      await upsertVideoContent(await adapter.fetchVideoMetadata(rawUrl), parentAccountId)
    : await upsertWebsiteContent(rawUrl, parentAccountId);

  await recordContentSubmission(parentAccountId, actorUserId, content, rawUrl);
  await ensureContentScored(content.id);

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

export { toContentSummary, upsertVideoContent, recordContentSubmission };
export type { ContentRow };

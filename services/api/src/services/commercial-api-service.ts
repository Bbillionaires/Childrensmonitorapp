import { prisma } from "@app/database";
import type { CommercialAnalyzeRequest, CommercialAnalyzeResponse } from "@app/types";
import type { Env } from "@app/config";
import { getProviderRegistry } from "./provider-registry.js";
import { upsertVideoContent, upsertWebsiteContent } from "./content-service.js";
import { ensureContentScored, getScoreSummary } from "./scoring-service.js";

/**
 * A category counts as a "risk flag" in the public API's flattened sense (see
 * SUPERVISION_SCORE.md's "Future: commercial Supervision Score API" sketch,
 * `"riskFlags": ["advertising_manipulation"]`) once it scored low enough to actually concern a
 * parent — this is the same threshold used nowhere else, chosen as "below the midpoint," since
 * the public contract has no notion of this engine's internal confidence/band machinery and
 * just wants a short, actionable list of category ids.
 */
const RISK_FLAG_THRESHOLD = 500;

/**
 * The business logic behind POST /api/v1/analyze — resolves a URL through the same
 * ContentProvider registry (and dedup-by-(providerId,providerRefId)) every internal caller
 * uses, with no parent account attached (`firstImportedByParentAccountId: null`), scores it,
 * and maps the result onto the documented public contract. `request.targetAge` is accepted
 * but intentionally unused — see CommercialAnalyzeRequest's doc comment in @app/types and
 * COMMERCIAL_API.md for why: this engine scores content intrinsically, the same way it does
 * for this app's own parents, and there is no age-adjusted scoring model (yet).
 */
export async function analyzeContentForApiClient(
  env: Env,
  apiClientId: string,
  apiKeyId: string,
  request: CommercialAnalyzeRequest,
): Promise<CommercialAnalyzeResponse> {
  const registry = getProviderRegistry(env);
  const adapter = registry.resolve(request.contentUrl);

  const content = adapter
    ? await upsertVideoContent(await adapter.fetchVideoMetadata(request.contentUrl), null)
    : await upsertWebsiteContent(request.contentUrl, null);

  await ensureContentScored(env, content.id);
  const score = await getScoreSummary(content.id);

  await prisma.apiUsageLog.create({
    data: { apiClientId, apiKeyId, endpoint: "POST /api/v1/analyze", contentId: content.id },
  });

  if (!score) {
    // Scoring runs synchronously above; this would only happen if it somehow failed without
    // throwing, which ensureContentScored's own design doesn't do — kept as a defensive 500
    // rather than returning a fabricated score.
    throw new Error("Content was not scored");
  }

  const riskFlags = score.categories.filter((c) => c.score < RISK_FLAG_THRESHOLD).map((c) => c.categoryId);
  const categoryScores = Object.fromEntries(score.categories.map((c) => [c.categoryId, c.score]));

  return {
    contentIdentifier: content.id,
    supervisionScore: score.overallScore,
    categoryScores,
    confidence: score.confidence,
    riskFlags,
    explanation: score.explanation,
    analysisVersion: score.modelVersion,
  };
}

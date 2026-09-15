-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AgeRange" AS ENUM ('AGE_3_5', 'AGE_6_8', 'AGE_9_12', 'AGE_13_15', 'AGE_16_17');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('WEB', 'IOS', 'ANDROID', 'TV');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'WEBSITE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalSource" AS ENUM ('MANUAL', 'AI_DISCOVERY', 'PLAYLIST_IMPORT', 'AUTO_RULE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('NEW_SAFETY_INFO', 'SCORE_DROPPED', 'PROVIDER_FLAG_CHANGED', 'PARENT_REPORT_VALIDATED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'KEPT_APPROVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('INAPPROPRIATE_CONTENT', 'VIOLENCE', 'SEXUAL_CONTENT', 'DISTURBING_IMAGERY', 'GROOMING_INDICATORS', 'DANGEROUS_CHALLENGE', 'MISLEADING_AGE_CLASSIFICATION', 'ADVERTISING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'VALIDATED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RecommendationDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PARENT',
    "emailVerifiedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEncrypted" TEXT,
    "pinHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "parentAccountId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "ageRange" "AgeRange",
    "birthYear" INTEGER,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supervisionScoreMinimum" INTEGER NOT NULL DEFAULT 900,
    "categoryThresholdOverrides" JSONB,
    "dailyLimitMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "parentAccountId" TEXT NOT NULL,
    "childId" TEXT,
    "label" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'WEB',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_providers" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "requiresOfficialApi" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "content_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerRefId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "creatorName" TEXT,
    "providerMadeForKids" BOOLEAN,
    "rawMetadata" JSONB,
    "firstImportedByParentAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "captionsAvailable" BOOLEAN NOT NULL DEFAULT false,
    "transcriptFetchedAt" TIMESTAMP(3),
    "ageMetadataRaw" JSONB,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websites" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "allowedDomain" TEXT NOT NULL,
    "allowedPathPrefix" TEXT,
    "blockExternalNavigation" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "providerRefId" TEXT,
    "ownerParentAccountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_items" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_approvals" (
    "id" TEXT NOT NULL,
    "parentAccountId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByUserId" TEXT,
    "source" "ApprovalSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,

    CONSTRAINT "parent_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_content_permissions" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedViaId" TEXT NOT NULL,

    CONSTRAINT "child_content_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viewing_history" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "deviceId" TEXT,
    "playlistItemId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationWatchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "completionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "viewing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_time_rules" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "dailyLimitMinutes" INTEGER,
    "allowedWindows" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',

    CONSTRAINT "screen_time_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_categories" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "safety_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervision_scores" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "currentScoreVersionId" TEXT NOT NULL,

    CONSTRAINT "supervision_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_versions" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalsUsed" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "previousScoreVersionId" TEXT,

    CONSTRAINT "score_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_category_results" (
    "id" TEXT NOT NULL,
    "scoreVersionId" TEXT NOT NULL,
    "safetyCategoryId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "detectedFactors" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "score_category_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_alerts" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "childId" TEXT,
    "alertType" "AlertType" NOT NULL,
    "previousScoreVersionId" TEXT,
    "newScoreVersionId" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_reports" (
    "id" TEXT NOT NULL,
    "reportingParentAccountId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "childId" TEXT,
    "category" "ReportCategory" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "parent_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_requests" (
    "id" TEXT NOT NULL,
    "parentAccountId" TEXT NOT NULL,
    "childId" TEXT,
    "rawQuery" TEXT NOT NULL,
    "structuredQuery" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL,
    "searchRequestId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "matchReason" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "presentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentDecision" "RecommendationDecision" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_accounts_userId_key" ON "parent_accounts"("userId");

-- CreateIndex
CREATE INDEX "children_parentAccountId_idx" ON "children"("parentAccountId");

-- CreateIndex
CREATE INDEX "devices_parentAccountId_idx" ON "devices"("parentAccountId");

-- CreateIndex
CREATE INDEX "devices_childId_idx" ON "devices"("childId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "content_providerId_providerRefId_key" ON "content"("providerId", "providerRefId");

-- CreateIndex
CREATE UNIQUE INDEX "videos_contentId_key" ON "videos"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "websites_contentId_key" ON "websites"("contentId");

-- CreateIndex
CREATE INDEX "playlists_ownerParentAccountId_idx" ON "playlists"("ownerParentAccountId");

-- CreateIndex
CREATE INDEX "playlist_items_playlistId_idx" ON "playlist_items"("playlistId");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_items_playlistId_contentId_key" ON "playlist_items"("playlistId", "contentId");

-- CreateIndex
CREATE INDEX "parent_approvals_parentAccountId_idx" ON "parent_approvals"("parentAccountId");

-- CreateIndex
CREATE INDEX "parent_approvals_childId_idx" ON "parent_approvals"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_approvals_childId_contentId_key" ON "parent_approvals"("childId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "child_content_permissions_grantedViaId_key" ON "child_content_permissions"("grantedViaId");

-- CreateIndex
CREATE INDEX "child_content_permissions_childId_idx" ON "child_content_permissions"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "child_content_permissions_childId_contentId_key" ON "child_content_permissions"("childId", "contentId");

-- CreateIndex
CREATE INDEX "viewing_history_childId_idx" ON "viewing_history"("childId");

-- CreateIndex
CREATE INDEX "viewing_history_contentId_idx" ON "viewing_history"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "screen_time_rules_childId_key" ON "screen_time_rules"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "supervision_scores_contentId_key" ON "supervision_scores"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "supervision_scores_currentScoreVersionId_key" ON "supervision_scores"("currentScoreVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "score_versions_previousScoreVersionId_key" ON "score_versions"("previousScoreVersionId");

-- CreateIndex
CREATE INDEX "score_versions_contentId_idx" ON "score_versions"("contentId");

-- CreateIndex
CREATE INDEX "score_category_results_scoreVersionId_idx" ON "score_category_results"("scoreVersionId");

-- CreateIndex
CREATE INDEX "safety_alerts_contentId_idx" ON "safety_alerts"("contentId");

-- CreateIndex
CREATE INDEX "safety_alerts_childId_idx" ON "safety_alerts"("childId");

-- CreateIndex
CREATE INDEX "parent_reports_contentId_idx" ON "parent_reports"("contentId");

-- CreateIndex
CREATE INDEX "search_requests_parentAccountId_idx" ON "search_requests"("parentAccountId");

-- CreateIndex
CREATE INDEX "ai_recommendations_searchRequestId_idx" ON "ai_recommendations"("searchRequestId");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_accounts" ADD CONSTRAINT "parent_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "content_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_firstImportedByParentAccountId_fkey" FOREIGN KEY ("firstImportedByParentAccountId") REFERENCES "parent_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_ownerParentAccountId_fkey" FOREIGN KEY ("ownerParentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_approvals" ADD CONSTRAINT "parent_approvals_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_approvals" ADD CONSTRAINT "parent_approvals_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_approvals" ADD CONSTRAINT "parent_approvals_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_content_permissions" ADD CONSTRAINT "child_content_permissions_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_content_permissions" ADD CONSTRAINT "child_content_permissions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_content_permissions" ADD CONSTRAINT "child_content_permissions_grantedViaId_fkey" FOREIGN KEY ("grantedViaId") REFERENCES "parent_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_history" ADD CONSTRAINT "viewing_history_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_history" ADD CONSTRAINT "viewing_history_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_history" ADD CONSTRAINT "viewing_history_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_history" ADD CONSTRAINT "viewing_history_playlistItemId_fkey" FOREIGN KEY ("playlistItemId") REFERENCES "playlist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_time_rules" ADD CONSTRAINT "screen_time_rules_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_scores" ADD CONSTRAINT "supervision_scores_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_scores" ADD CONSTRAINT "supervision_scores_currentScoreVersionId_fkey" FOREIGN KEY ("currentScoreVersionId") REFERENCES "score_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_versions" ADD CONSTRAINT "score_versions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_versions" ADD CONSTRAINT "score_versions_previousScoreVersionId_fkey" FOREIGN KEY ("previousScoreVersionId") REFERENCES "score_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_category_results" ADD CONSTRAINT "score_category_results_scoreVersionId_fkey" FOREIGN KEY ("scoreVersionId") REFERENCES "score_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_category_results" ADD CONSTRAINT "score_category_results_safetyCategoryId_fkey" FOREIGN KEY ("safetyCategoryId") REFERENCES "safety_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_previousScoreVersionId_fkey" FOREIGN KEY ("previousScoreVersionId") REFERENCES "score_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_newScoreVersionId_fkey" FOREIGN KEY ("newScoreVersionId") REFERENCES "score_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_reports" ADD CONSTRAINT "parent_reports_reportingParentAccountId_fkey" FOREIGN KEY ("reportingParentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_reports" ADD CONSTRAINT "parent_reports_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_reports" ADD CONSTRAINT "parent_reports_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_requests" ADD CONSTRAINT "search_requests_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_requests" ADD CONSTRAINT "search_requests_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_searchRequestId_fkey" FOREIGN KEY ("searchRequestId") REFERENCES "search_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

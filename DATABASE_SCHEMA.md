# Database Schema

Full normalized schema for the domain. The authoritative version is the Prisma schema at
`packages/database/prisma/schema.prisma`; this document is the human-readable map of it.
Milestone 1 creates every table listed here (so later milestones never need a destructive
migration to add a missing concept) but only wires up CRUD/business logic for the tables
marked **[M1]**. Everything else is populated starting in the milestone noted.

## Identity & accounts

### User **[M1]**
The login identity. A `User` with `role = PARENT` owns a `ParentAccount`. Children do not
have a `User` row with a password — see `Child` below; this is a deliberate COPPA-aligned
choice (no independent child login credential to compromise).
- id, email (unique, parents only), passwordHash (argon2id), emailVerifiedAt
- mfaEnabled, mfaSecretEncrypted (nullable, TOTP)
- pinHash (nullable — parent quick-switch PIN)
- createdAt, updatedAt, lastLoginAt

### ParentAccount **[M1]**
- id, userId (1:1 → User), displayName, timezone, createdAt

### Child **[M1]**
- id, parentAccountId (→ ParentAccount), firstName/nickname, avatarUrl, ageRange (enum:
  `AGE_3_5`, `AGE_6_8`, `AGE_9_12`, `AGE_13_15`, `AGE_16_17`) or explicit birthYear (optional,
  minimized), interests (string[]), supervisionScoreMinimum (int, default 900),
  categoryThresholdOverrides (JSON: category → strict/moderate/relaxed), dailyLimitMinutes
  (nullable), createdAt, updatedAt, archivedAt (soft delete — history must survive)
- Child login is via a parent-issued device PIN/QR handoff (`ChildDeviceSession`), never an
  independent email/password.

### Device **[M1]**
- id, parentAccountId, childId (nullable — a device can be parent-only), label, platform
  (enum: WEB, IOS, ANDROID, TV), lastSeenAt, createdAt
- Used for viewing-history attribution and for revoking a specific device's session.

### AuditLog **[M1]**
- id, actorUserId (nullable — system actions), actorRole, action (string, e.g.
  `CHILD_APPROVAL_GRANTED`), targetType, targetId, metadata (JSON), createdAt
- Every sensitive parent action (approval changes, threshold changes, MFA changes, child
  creation/deletion) writes one row. Immutable — no update/delete path exists in the API.

## Content domain (Milestone 2+)

### ContentProvider
- id (string key, e.g. `youtube`, `vimeo`, `website`), displayName, apiBaseUrl,
  requiresOfficialApi (bool), enabled (bool)

### Content
Provider-agnostic parent row for anything importable (a video OR a website).
- id, providerId (→ ContentProvider), providerRefId (the provider's own ID, e.g. YouTube
  video ID), contentType (enum: VIDEO, WEBSITE), sourceUrl, title, description, thumbnailUrl,
  durationSeconds (nullable, websites have none), creatorName, providerMadeForKids (nullable
  bool — a signal, not a decision), rawMetadata (JSON snapshot from the provider),
  firstImportedByParentAccountId, createdAt, updatedAt
- Unique on (providerId, providerRefId) — never duplicate-import the same video.

### Video
1:1 extension of `Content` where contentType = VIDEO, for video-specific fields that would
otherwise be null on every website row: captionsAvailable, transcriptFetchedAt (nullable —
Milestone 7 hook), ageMetadataRaw.

### Website
1:1 extension of `Content` where contentType = WEBSITE: allowedDomain, allowedPathPrefix
(nullable — restrict to a subsection of a domain), blockExternalNavigation (bool, default
true).

### ContentSubmission
Content is deduplicated globally by (providerId, providerRefId) — a second, unrelated
parent submitting the same public video reuses the existing row rather than re-fetching the
provider API. That means `Content` alone can't answer "what has this parent submitted"
(`firstImportedByParentAccountId` only names whoever happened to import it first).
`ContentSubmission` is the many-to-many record of every parent account's own submission
queue, independent of who imported the underlying `Content` first — it's what "Pending
Reviews" and "my submitted content" are actually queried against.
- id, parentAccountId, contentId, submittedByUserId (nullable), createdAt
- Unique on (parentAccountId, contentId).

### Playlist
- id, providerId (nullable — a parent-created playlist has no provider), providerRefId
  (nullable — set if imported wholesale from e.g. a YouTube playlist URL), ownerParentAccountId,
  title, description, createdAt, updatedAt
- Unique on (ownerParentAccountId, providerId, providerRefId) — unlike `Content`, a playlist
  is never shared across families: each parent's import of "the same" source playlist gets
  its own row, re-imported in place rather than duplicated.

### PlaylistItem
- id, playlistId (→ Playlist), contentId (→ Content), position (int), addedAt

## Approval domain (Milestone 2+)

### ParentApproval
The record of a parent's decision on one piece of content for one child. This is the only
thing that can make content visible to a child.
- id, parentAccountId, childId, contentId, decision (enum: APPROVED, REJECTED), decidedAt,
  decidedByUserId, source (enum: MANUAL, AI_DISCOVERY, PLAYLIST_IMPORT, AUTO_RULE — auto rules
  land post-MVP but the column exists now), notes (nullable)
- Unique on (childId, contentId) — latest decision wins; history is preserved via AuditLog +
  this row's own updatedAt, not by duplicating rows.

### ChildContentPermission
Materialized "what can this child actually open right now" row, derived from
`ParentApproval` (and, later, auto-rules). Kept as its own table — rather than computing the
join on every child request — so the child library query is a single indexed lookup and so
revocation is a single row delete with no risk of a stale join elsewhere.
- id, childId, contentId, grantedAt, grantedVia (→ ParentApproval.id)
- Every write path that inserts here has a matching delete path when a `ParentApproval` is
  changed to REJECTED — enforced by a service-layer transaction, not left to eventual
  consistency.

## Viewing (Milestone 3/6)

### ViewingHistory
- id, childId, contentId, deviceId, startedAt, durationWatchedSeconds, completionPercentage,
  playlistId (nullable — the source the child was watching through)

### ScreenTimeRule
- id, childId, dailyLimitMinutes (nullable), allowedWindows (JSON: array of
  {dayOfWeek, startTime, endTime}), timezone

## Safety domain (Milestone 5/6)

### SafetyCategory
- id (string key: `violence`, `sexual_content`, `nudity`, `grooming_indicators`, `fear`,
  `disturbing_imagery`, `jump_scares`, `profanity`, `drugs`, `alcohol`, `weapons`,
  `self_harm`, `dangerous_challenges`, `bullying`, `adult_themes`,
  `advertising_manipulation`, `gambling`, `external_link_risk`, `hate_extremism`,
  `age_appropriateness`), displayName, description, weight (contribution to overall score)

### SupervisionScore
The current, user-facing score for a piece of content. Always points at its latest
`ScoreVersion`; never edited in place.
- id, contentId (unique), currentScoreVersionId

### ScoreVersion
Full audit trail — see SUPERVISION_SCORE.md for the versioning rules this table exists to
enforce.
- id, contentId, modelVersion (string, e.g. `rule-based-v1`), overallScore (0–1000),
  confidence (0–1, float), analyzedAt, signalsUsed (JSON — which inputs were available),
  explanation (text), previousScoreVersionId (nullable, self-reference)

### ScoreCategoryResult
- id, scoreVersionId (→ ScoreVersion), safetyCategoryId (→ SafetyCategory), score (0–100),
  confidence (0–1), detectedFactors (JSON string array), notes (text, nullable)

### SafetyAlert
- id, contentId, childId (nullable — content-level alert can fan out to every child who has
  it approved), alertType (enum: NEW_SAFETY_INFO, SCORE_DROPPED, PROVIDER_FLAG_CHANGED,
  PARENT_REPORT_VALIDATED), previousScoreVersionId, newScoreVersionId (nullable),
  status (enum: OPEN, KEPT_APPROVED, REMOVED), createdAt, resolvedAt, resolvedByUserId

### ParentReport
- id, reportingParentAccountId, contentId, childId (nullable), category (enum matching the
  report categories in PRODUCT_REQUIREMENTS.md), details (text), status (enum: SUBMITTED,
  REVIEWED, VALIDATED, DISMISSED), createdAt, reviewedAt

## Discovery (Milestone 4)

### SearchRequest
- id, parentAccountId, childId (nullable), rawQuery (text, the parent's natural-language
  brief), structuredQuery (JSON, the translated `DiscoveryQuery`), createdAt

### AIRecommendation
- id, searchRequestId, contentId, matchReason (text), rank, presentedAt, parentDecision
  (enum: PENDING, APPROVED, REJECTED, nullable until acted on)

## Cross-cutting

Every table has `createdAt`; mutable tables have `updatedAt`. Soft-delete (`archivedAt` /
`status` enums) is used wherever history must be queryable after a parent "removes" something,
in line with "never silently remove parent-approved content."

## Notes on normalization choices

- `Content` is provider-agnostic and shared across every child — approval is per-child via
  `ParentApproval`, so importing a video once and approving it for three children does not
  triplicate metadata or re-fetch the provider API three times.
- Score data is fully separated from `Content` (its own versioned table set) so re-scoring
  under a new model version never touches the content row itself, and every historical score
  a parent saw remains reconstructable.

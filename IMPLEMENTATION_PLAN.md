# Implementation Plan

## Repository state at start

Empty repository (no prior commits), branch `claude/parental-control-mvp-3samwq` created
fresh. No existing application to preserve — this plan builds from scratch rather than
migrating anything.

## Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One type system across API/web/mobile/packages; `packages/types` becomes a real shared contract, not documentation. |
| API | Fastify + Prisma + PostgreSQL | Fastify: fast, schema-validated, first-class plugin model for auth guards/rate-limiting. Prisma: type-safe migrations and a single schema source of truth (critical given how central `DATABASE_SCHEMA.md`'s versioning/audit requirements are). Postgres: relational integrity for approval/permission tables where correctness beats flexibility. |
| Web | Next.js (App Router) + Tailwind | Server-rendered parent dashboard (fast, SEO-irrelevant but auth-friendly with server components) and a child experience that also runs as an installable PWA on a phone/tablet browser today, without waiting for a native app in Milestone 8. |
| Monorepo tooling | pnpm workspaces + Turborepo | Cheap, fast, no vendor lock-in; scales cleanly to add `apps/mobile` and `apps/tv-future` without restructuring. |
| Mobile (future) | Expo/React Native | Shares `packages/types` with the web app; Expo gets us to TestFlight/Play Store fastest for Milestone 8 without native Xcode/Android Studio project maintenance from day one. |
| AI discovery (future) | Claude API (Anthropic) | Structured-output-friendly for translating a parent's natural-language brief into a typed `DiscoveryQuery`; swappable behind `DiscoveryTranslator`. |
| Hosting (recommended, not provisioned) | API+DB: Railway or Fly.io / Web: Vercel | Both integrate with this session's available tooling; neither is required to develop Milestone 1 locally. |

Nothing here is irreversible: every volatile piece (content provider, AI provider, scoring
model, even the database engine) sits behind an interface in its own package specifically so
a later swap doesn't ripple through the rest of the system.

## Cost expectations (rough, revisit before committing spend)

- **Hosting (Milestones 1–3, low traffic)**: ~$0–25/mo (a small managed Postgres + one API
  instance; Vercel's free tier covers early web hosting).
- **YouTube Data API v3**: free quota (10,000 units/day) covers development and modest
  production use; metadata fetches (~1 unit) and playlist listing (~1 unit/page) are cheap,
  video search (100 units) is the expensive call and is only used in Milestone 4's discovery
  flow, not in ordinary metadata import.
- **Claude API (AI discovery, Milestone 4)**: usage-based, low per-request cost for a short
  brief → structured query translation; see the `claude-api` skill/pricing reference at
  implementation time for current rates.
- **Email (password reset, Milestone 1)**: a transactional email provider (e.g. Resend) —
  free tier typically covers low volume.
- **Advanced analysis (Milestone 7)**: the largest future cost center (audio transcription,
  frame sampling, transcript analysis at scale) — deliberately deferred past MVP and should
  get its own cost model before enabling.

## What can be built immediately (no external account needed)

Everything in Milestone 1: monorepo scaffold, full database schema, parent auth (password
hashing, JWT sessions, PIN, MFA architecture), audit logging, parent dashboard shell, child
profile CRUD, and the interface layer (`ContentProvider`, `SupervisionScorer`,
`DiscoveryTranslator`) that later milestones implement against. All of this only needs a
Postgres database, which can be run locally via Docker with no third-party account.

## What requires a provider/API credential (stopped at, not silently mocked)

| Credential | Needed for | Where to get it | Env var |
|---|---|---|---|
| `DATABASE_URL` | Any environment beyond local Docker Postgres (staging/production) | A managed Postgres provider (Railway, Supabase, RDS, etc.) | `DATABASE_URL` |
| `YOUTUBE_API_KEY` | Milestone 2 — fetching real video/playlist metadata from YouTube | Google Cloud Console → enable "YouTube Data API v3" → create an API key | `YOUTUBE_API_KEY` |
| `OPENAI_API_KEY` | Milestone 4 — AI-assisted discovery, **primary** provider (natural language → structured query) | platform.openai.com/api-keys | `OPENAI_API_KEY` |
| `OPENAI_MODEL` (optional) | Overrides the default cost-tier model (`gpt-5.4-mini`) | n/a — just a config value | `OPENAI_MODEL` |
| `ANTHROPIC_API_KEY` | Milestone 4 — AI-assisted discovery, **fallback** provider only (used when OpenAI's call fails) | console.anthropic.com → API keys | `ANTHROPIC_API_KEY` |
| `RESEND_API_KEY` (or equivalent) | Milestone 1's password-reset email delivery in a real (non-local) environment | resend.com (or any transactional email provider) | `RESEND_API_KEY` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Milestone 1 — session signing | Generate locally (`openssl rand -base64 48`); not a third-party account | same names |

Until `YOUTUBE_API_KEY` is supplied, `content-providers` ships as a clearly labeled
interface/stub — no fabricated metadata is ever returned as if real. Discovery
(`packages/ai`) needs at least one of `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`; with neither set,
the factory returns `undefined` and the route fails honestly (503) rather than faking a
translation. Only `OPENAI_API_KEY` is required for discovery to work at all — Anthropic is
resilience, not a hard dependency — but both configured together is the recommended setup
(see Milestone 4 below for why).

## Major technical limitations to keep in view

- YouTube's API does not expose reliable frame-level/audio content signals — Milestone 7's
  deeper analysis (frame sampling, transcript/audio) requires either YouTube's caption API
  (where available) or a separate transcription pipeline (cost + latency implications).
- Embedding third-party video still runs inside that provider's own player, which has its
  own UI chrome (e.g. YouTube's embedded player controls) — "no unapproved recommendations"
  is enforced by *not exposing* the provider's related-video surface (using the privacy-
  enhanced/no-suggestions embed parameters and a wrapper the API controls), not by fully
  reskinning a third-party player, which their terms may restrict.
- "Made for Kids" and similar provider flags are metadata, not a guarantee, and some
  providers restrict COPPA-flagged content features (e.g. disable comments/personalization)
  in ways that can affect what our API is able to retrieve.
- A website approved for a child plays back inside a sandboxed `<iframe>` (Milestone 3). This
  genuinely restricts what that page's own JavaScript can do (no top-level navigation, no
  popups) via the `sandbox` attribute, and the child always has our own "Back to Library"
  chrome outside the iframe regardless of what's inside it — but it does **not** let us
  inspect or block where the page itself navigates *within* the iframe (e.g. a link to
  another page on an unrelated domain), since cross-origin iframe content is opaque to the
  parent page by browser design. Reliable redirect-blocking per PRODUCT_REQUIREMENTS.md
  requires a native controlled WebView with its own navigation-delegate API (Android
  `WebViewClient`/iOS `WKNavigationDelegate`), which is a Milestone 8/9 native-app capability,
  not something a web `<iframe>` can provide. Until then, "controlled" for websites means
  "contained with an always-visible exit," not "navigation-proof."

## Major legal/privacy considerations

See SECURITY_AND_PRIVACY.md's closing section — verifiable parental consent mechanism,
state-level children's-privacy laws, data retention policy, and DPAs with any third-party
provider are flagged for legal review, not resolved unilaterally by this implementation.

## Milestone 1 — exact implementation plan (this session)

1. Monorepo scaffold: `pnpm-workspace.yaml`, root `package.json`, Turborepo config, shared
   `tsconfig`, `.env.example`, `docker-compose.yml` (local Postgres), `.gitignore`.
2. `packages/database`: full Prisma schema per DATABASE_SCHEMA.md (every table), initial
   migration, seed script for local dev.
3. `packages/types`: zod schemas for auth, child profile, and session/user shapes (contracts
   used by both API and web).
4. `packages/auth`: Argon2 password hashing, JWT access/refresh issuing + verification, PIN
   hashing/verification, RBAC guard factory, TOTP secret generation (MFA-ready, not yet
   exposed in the UI).
5. `packages/content-providers`, `packages/supervision-score`, `packages/ai`: interfaces and
   package scaffolding only (documented above), no real adapters yet.
6. `services/api` (Fastify): `/api/auth/*` (register, login, refresh, logout, password
   reset request/confirm), `/api/parents/me`, `/api/parents/children` (CRUD), all behind the
   RBAC guard; audit logging wired into every mutating parent route.
7. `apps/web` (Next.js): parent register/login/reset-password pages, a dashboard shell (nav
   for the sections listed in PRODUCT_REQUIREMENTS.md, most as "coming in Milestone N"
   placeholders), and full child-profile management (create/edit/list/archive) calling the
   real API.
8. Automated tests (`services/api`, Vitest against Fastify's own `inject()` — no separate
   HTTP server or Supertest needed): a parent cannot read/mutate another parent's children;
   an unauthenticated request to any `/api/parents/*` or `/api/child/*` route is rejected;
   password hashes are never returned by any endpoint.
9. Commit and push to `claude/parental-control-mvp-3samwq`.

**Status: done.** Verified against a live local Postgres, including a full browser
walkthrough (register → dashboard → create/edit child).

## Milestone 2 — exact implementation plan (done)

1. Schema addition: `ContentSubmission` (parent ↔ content join table) — needed because
   `Content` is deduplicated globally by (providerId, providerRefId), so it alone can't
   answer "what has this parent submitted." See DATABASE_SCHEMA.md.
2. `packages/content-providers`: a real `YouTubeContentProvider` (YouTube Data API v3 —
   video URL/ID parsing, `videos.list` metadata fetch, `playlistItems.list` pagination,
   a privacy-enhanced embed URL). `canHandle()` needs no API key, so a YouTube URL is always
   recognized as one; fetching metadata without `YOUTUBE_API_KEY` configured throws a clear
   `ContentProviderNotConfiguredError` instead of silently misfiling it as a website or
   fabricating data.
3. `services/api`: `submitContentUrl` (resolve via the provider registry or fall back to a
   website whitelist entry — no scraping either way), `decideApproval` (the only code path
   that can create or delete a `ChildContentPermission`, transactionally with the
   `ParentApproval` it comes from), and the review-queue query per child/filter.
4. Routes: `POST /api/parents/content/submit`, `GET /api/parents/content`,
   `GET /api/parents/children/:childId/queue`, `POST /api/parents/children/:childId/decisions`
   — all behind the same parent-session + CSRF + per-child ownership checks as Milestone 1.
5. `apps/web`: real Pending Reviews (submit a URL, approve/reject per child) and Approved
   Content pages, replacing their Milestone 1 placeholders.
6. Tests: website submission + dedup, a YouTube submission failing honestly without a key,
   approve/reject correctly granting/revoking `ChildContentPermission`, and the same
   cross-parent isolation guarantee extended to content and approvals.

**Status: done**, including the YouTube adapter's live API calls — a `YOUTUBE_API_KEY` was
supplied after the initial implementation and used to verify a real submission end-to-end
(real title/creator/duration/thumbnail/`madeForKids` fetched from `videos.list`, through the
API, into the approval queue, into the approved library, in a real browser session) — not
just the mocked unit tests covering the parsing/mapping logic against YouTube's documented
response shape. Website submission, the approval pipeline, and the UI were already verified
against the live local Postgres and a real browser session.

## Milestone 3 — exact implementation plan (done)

1. Schema: a per-parent uniqueness constraint on `Playlist` (`ownerParentAccountId`,
   `providerId`, `providerRefId`) so re-importing a playlist refreshes that parent's own row
   rather than creating a duplicate — unlike `Content`, a `Playlist` is never shared across
   families.
2. `packages/content-providers`: `fetchPlaylistMetadata` and `extractPlaylistRefId` added to
   the YouTube adapter and the `ContentProvider` interface (both optional, since not every
   provider has a "playlist" concept). Fixed a real bug this work surfaced: `canHandle()`
   only recognized video URLs, so a bare `/playlist?list=...` link was never matched to any
   adapter at all — playlist import silently failed as "unsupported" until this was caught by
   the test in step 6 and fixed to also recognize playlist URLs.
3. `services/api`: `importPlaylist` (fetches a playlist's current items through the owning
   provider's official API, upserts each as `Content`, replaces the `Playlist`'s items so a
   re-import reflects removals too) and `bulkDecideApproval` (best-effort per item, powering
   "Select All / Approve Selected / Reject Selected"). A device-handoff session mechanism:
   `startChildDeviceSession` mints a CHILD-role token that overwrites the browser's existing
   session cookie, and — a second real bug this work caught — explicitly **revokes the
   parent's refresh token server-side**, since merely clearing the cookie client-side left the
   underlying token still valid in the database (replayable by anyone who'd captured it via
   devtools before handoff). `exitToParentSession` reverses this via the parent's PIN.
4. Child-facing routes under `/api/child/*` (profile, library, playlist detail, playback,
   exit-to-parent), every one scoped to the session token's own `childId` — never a
   client-supplied one. `getPlaybackInfo` re-checks the `ChildContentPermission` at the
   moment of playback, not just when the library was listed, so a parent's revocation takes
   effect immediately even mid-browsing-session.
5. `apps/web`: a real Playlists page (import → checkbox selection → per-child bulk
   approve/reject) and an entirely new `/child` experience — large-card home screen (grouped
   by Playlists/Watch/Websites, not the product spec's more granular category taxonomy, which
   needs content categorization not yet built), playlist browsing, a playback screen with
   Replay/Next Approved Video (playlist-scoped only, never arbitrary)/Back to Library, and a
   PIN-gated "Parent sign-in" to exit child mode.
6. Tests: 22 API integration tests (up from 13), including the two bugs above (both caught by
   tests before this reached you, not after), child/child isolation across siblings of the
   same parent, permission re-checks at play time, and the honest-failure path for playlist
   import without `YOUTUBE_API_KEY`. 32 unit tests for the YouTube adapter.

**Status: done**, verified end-to-end against the live YouTube Data API v3 and a real browser
session: real playlist import (title + all items with real metadata), bulk-approve for a
child, device handoff, the child home screen, playlist browsing, video playback with a
working "Next Approved Video" within the playlist, and exiting back to the parent dashboard
via PIN. See "Major technical limitations" above for the one honest gap: website playback is
contained (sandboxed iframe, always-visible exit) but not redirect-proof — that needs a
native WebView, a Milestone 8/9 capability.

## Milestone 4 — exact implementation plan

1. `packages/content-providers`: `searchVideos` added to the YouTube adapter and the
   `ContentProvider` interface (optional — a website "provider" doesn't search), using the
   official `search.list` endpoint with `safeSearch: strict` always set. `ContentProviderRegistry.getById`
   added since discovery needs a provider by id, not resolved from a submitted URL.
2. `packages/ai`: a real `ClaudeDiscoveryTranslator` using the Claude API's structured
   outputs (`client.messages.parse` + `zodOutputFormat`, `claude-opus-5-5`) — guaranteed
   schema-valid JSON instead of hand-parsed free text. `createDiscoveryTranslator` returns
   `undefined` without `ANTHROPIC_API_KEY`, so the route fails honestly (503) rather than
   fabricating a translation.
3. `services/api`: `runDiscoverySearch` (brief → structured query → YouTube search →
   persisted `Content`/`ContentSubmission`/`SearchRequest`/`AIRecommendation` rows, before a
   parent ever sees a candidate), `decideDiscoveryRecommendations` (reuses `decideApproval`
   tagged `source: "AI_DISCOVERY"` for the audit trail — the only thing that can make a
   discovered video visible to a child, exactly like every other approval path), and
   `createPlaylistFromDiscovery` (bundles a selection into a new parent-owned playlist).
4. `apps/web`: a real Discover Content page — natural-language brief, a results grid with
   each candidate's match reason, Select All/Deselect All (manual selection is just
   unchecking), Approve Selected/Reject, a saved-searches list (every search is persisted, so
   "Save Search" needed no separate action), and Create Playlist from a selection.
5. Tests: 5 new API integration tests (parent/parent isolation extended to recommendations
   and playlist creation, the `AI_DISCOVERY` source tag, honest 503 without the key) and 5
   unit tests for the translator against a mocked Anthropic client. 3 new YouTube adapter
   unit tests for `searchVideos`.

**Status:** YouTube search is implemented and **verified against the live API** (a real
query for "planets gravity rockets" returned six relevant, correctly-tagged results with
real `madeForKids` flags). The Claude translator is implemented and unit-tested against a
mocked client, but **not yet exercised against the live Claude API** — no `ANTHROPIC_API_KEY`
was available in this environment. The honest-failure path (503, not fabricated results) is
verified in a real browser session. See the credentials table above for what's needed and
where to get it.

**Cost note:** YouTube's `search.list` costs 100 quota units per call against the same
10,000/day free quota that metadata fetches barely touch (~1 unit each) — so this feature
caps out around 100 discovery searches/day on the free tier before quota becomes a
consideration, markedly more constrained than ordinary URL/playlist import.

### Milestone 4 follow-up — dual-provider discovery (OpenAI primary, Claude fallback)

The architecture above assumed a single translator. In practice, discovery is funded by one
shared, operator-paid key serving every parent on the app (not bring-your-own-key), so the
per-call cost of each search matters a lot more than it would for a single user. This
follow-up reworks `packages/ai` into a cost-optimized, resilient two-provider setup:

1. `packages/ai/src/discovery-schema.ts`: the structured-output schema and prompt moved into
   one shared module (built against `zod/v4`, since Anthropic's `zodOutputFormat` requires
   the v4-shaped type while OpenAI's `zodTextFormat` accepts either — zod 3.23+ ships both
   namespaces side by side, so this didn't require migrating the rest of the monorepo off
   `zod` v3), so both providers translate a brief identically.
2. `OpenAIDiscoveryTranslator` (new, **primary**): OpenAI's Responses API
   (`client.responses.parse` + `zodTextFormat`), defaulting to `gpt-5.4-mini` — the
   cost-efficient tier appropriate for a high-volume, shared-key feature — overridable via
   `OPENAI_MODEL` (e.g. the even cheaper `gpt-5.4-nano`, if volume ever calls for it).
3. `ClaudeDiscoveryTranslator` (unchanged logic, repositioned as **fallback only**): used when
   OpenAI's call throws (outage, malformed response), not for routine traffic.
4. `FallbackDiscoveryTranslator`: tries the primary, falls back on any failure, and only
   throws (with both error messages) if the fallback also fails.
5. `createDiscoveryTranslator({ openaiApiKey, openaiModel, anthropicApiKey })`: both keys →
   fallback composite; one key → that provider alone; neither → `undefined` (same honest
   503-on-missing-config principle as every other integration in this project).
6. The discovery endpoint (`POST /api/parents/discover`) now has its own rate limit — 10
   requests/hour, keyed by IP — separate from the app-wide default, since each call spends
   real money (an LLM call plus a 100-quota-unit YouTube search) from the shared key rather
   than a per-user credential.
7. Tests: 15 unit tests across `openai-translator.test.ts` (4), `fallback-translator.test.ts`
   (4), `factory.test.ts` (4), and the trimmed `claude-translator.test.ts` (3) — all against
   mocked SDK clients, no live calls.

**Status: done**, including live verification. Both `OPENAI_API_KEY` (a service-account key)
and `ANTHROPIC_API_KEY` were supplied and each exercised directly against its real API via
`createDiscoveryTranslator` with no mocking — a real brief ("educational videos about space
and planets for my 7 year old, under 15 minutes") was translated by the OpenAI-primary path
(`gpt-5.4-mini`) into a correctly-structured `DiscoveryQuery` (topics, inferred age, and
duration limit in seconds, all extracted without being explicitly told the field names).
`ANTHROPIC_API_KEY` is optional (fallback only) — `OPENAI_API_KEY` is the credential required
for discovery to function day-to-day.

## Milestone 5 — exact implementation plan (done)

1. `packages/supervision-score`: a real `RuleBasedSupervisionScorer` (`modelVersion:
   "rule-based-v1"`) — the first implementation of the `SupervisionScorer` interface
   scaffolded in Milestone 1. Metadata-only: title/description keyword matching against a
   term list per category (`category-terms.ts`), plus `providerMadeForKids` as one input
   affecting only the `age_appropriateness` category (never adopted as the score itself, per
   SUPERVISION_SCORE.md). Every category starts at a low-confidence neutral baseline (100/100,
   confidence 0.2) and is only marked down — with confidence raised accordingly — when a
   specific signal is found; it never claims certainty a title and description alone can't
   support. `riskBandForScore` maps the 0–1000 overall score to the LOW/MODERATE/ELEVATED/HIGH
   bands from SUPERVISION_SCORE.md's "Display" section. 14 unit tests.
2. `packages/types`: `supervisionScoreSummarySchema` (model version, overall score,
   confidence, risk band, explanation, per-category breakdown) and
   `approvedContentScoreItemSchema`. `ContentSummary` gained a `supervisionScore` field
   (nullable — null until scored, which should be rare/transient since scoring happens
   synchronously at content-creation time).
3. `services/api/src/services/scoring-service.ts`: `ensureContentScored(contentId)` persists
   the first (and, for now, only — nothing yet triggers a re-score) `ScoreVersion` +
   `ScoreCategoryResult` rows and points `SupervisionScore.currentScoreVersionId` at it, inside
   a transaction, append-only per SUPERVISION_SCORE.md's versioning rules. Called once, right
   after every content-creation path (`content-service.submitContentUrl`,
   `playlist-service.importPlaylist`, `discovery-service.runDiscoverySearch`) — `Content` is
   shared globally across families (see its doc comment), so a piece of content is scored
   once, not once per parent who happens to submit it. `attachSupervisionScores` batch-enriches
   a list of `ContentSummary` with their current score in one query each; wired into
   `approval-service.getChildContentQueue` (powers Pending Reviews/Approved Content),
   `discovery-service` candidates, and the new Scores route.
4. `services/api`: `GET /api/parents/scores` (`listApprovedContentWithScores`) — every piece
   of content approved for at least one of a parent's children, each annotated with which
   children it's approved for and its full score breakdown. Read-only: scores are produced at
   creation time, not computed on request.
5. `apps/web`: a `SupervisionScoreBadge` component (risk-band-colored pill + expandable "Why
   this score?" category breakdown, wired into the shared `ContentCard` so it shows up
   wherever a parent reviews content — Pending Reviews, Approved Content, Discover Content —
   not just its own page) and a real Supervision Scores page (worst-score-first, "Approved
   for: <children>" under each card), replacing the Milestone 1 placeholder. Fixed
   `dashboard-nav.ts`'s stale `"soon"` badges on sections that Milestones 2–4 had already
   shipped (Approved Content, Pending Reviews, Playlists, Discover Content).
6. Tests: 4 new API integration tests (auto-scoring on submission, idempotency — a
   re-submission never creates a second `ScoreVersion`, a keyword match propagating end-to-end
   through `ensureContentScored`, and the `/scores` route's parent/parent isolation) plus the
   14 scorer unit tests above.

**Status: done**, verified end-to-end in a real browser session against the live OpenAI +
YouTube APIs: a Discover Content search for dinosaur videos returned real candidates each
carrying a real computed Supervision Score badge (e.g. 984/1000 — Low risk, with "Age
appropriateness: 70/100 (50% conf.) — Platform does not flag this content as made for kids"
correctly the lowest-scoring category and the only one with raised confidence); approving them
and visiting the new Supervision Scores page showed every one, worst-first, each correctly
annotated with which child it was approved for; expanding "Why this score?" showed the full
20-category breakdown with `modelVersion: rule-based-v1` and the overall confidence. See
"Future analysis inputs" in SUPERVISION_SCORE.md for what later milestones add (transcript,
frame sampling, OCR) without changing this shape — `ScoringInput`'s optional fields already
exist for exactly that, and `RuleBasedSupervisionScorer` already uses them (keyword-matches
against `transcript`/`ocrText` too, and scores `external_link_risk` from
`externalLinksFound`) whenever a future producer starts populating them, with no interface
change needed.

## Milestone 6 — exact implementation plan (done)

No new external credentials. Everything here runs on data the app already has.

1. **Viewing history, made real.** Previously `getPlaybackInfo` created a `ViewingHistory` row
   with only `childId`/`contentId` set — `deviceId` was never threaded through (no code
   anywhere created a `Device` row for a child handoff session at all) and nothing ever
   updated `durationWatchedSeconds`/`completionPercentage` after creation. Now:
   - `child-session-service.ts`'s `startChildDeviceSession` creates a `Device` row per handoff
     (same pattern as a parent login in `auth-service.ts`) and adds `deviceId` to
     `ChildSessionClaims` — this product does no device fingerprinting, so "device" here just
     means "this particular handoff session," which is exactly the granularity the activity
     timeline needs.
   - `getPlaybackInfo` resolves the `PlaylistItem` (when played from a playlist) and records
     both it and the device on the `ViewingHistory` row, returning its id as
     `viewingHistoryId` in `PlaybackInfo`.
   - A new child route, `POST /api/child/viewing-history/:viewingHistoryId/progress`, accepts
     `{ positionSeconds }` — **wall-clock time the player has been open and visible, not exact
     playback position**. We don't integrate the provider's own player API (e.g. YouTube's
     IFrame Player API), so we can't observe pause/seek within a video; this is a documented,
     honest limitation, not a silent approximation. The server derives
     `completionPercentage` from the content's own already-known `durationSeconds` (never a
     client-supplied one) and only ever moves `durationWatchedSeconds` forward, so an
     out-of-order ping can't erase progress a later one already recorded. The child player
     page ticks a ref once per second while `document.visibilityState === "visible"` and pings
     every 10s plus once on cleanup.
   - `services/api/src/services/viewing-history-service.ts` + `GET /api/parents/activity`
     power the Viewing Activity dashboard page — a reverse-chronological timeline across all
     of a parent's children, with device label and playlist/source when known.
2. **Safety alerts, raised from a real trigger.** `scoring-service.ts`'s `ensureContentScored`
   now re-runs the scorer every time it's called (not just once) and compares the result to
   what's on file; if different, it appends a new `ScoreVersion` (never an in-place edit) and
   points `SupervisionScore.currentScoreVersionId` at it. This matters because
   `upsertVideoContent` already refreshes an existing `Content` row's title/description on
   every call — a creator editing their video's title/description, surfaced the next time a
   parent re-imports a playlist or re-submits the same URL, is the realistic source of "new
   safety information" this milestone can act on honestly; nothing here fabricates a change
   that didn't happen to the content's own metadata. When a re-score produces a worse result
   (risk band dropped, or the score crossed below a specific child's own
   `supervisionScoreMinimum`) for a child who currently holds a `ChildContentPermission` for
   that content, `raiseSafetyAlertsForRescore` creates a `SafetyAlert` row for that child.
   `safety-alert-service.ts` + `GET/POST /api/parents/alerts` power the Safety Alerts
   dashboard page: **Keep Approved** just closes the alert, **Remove** reuses `decideApproval`
   (the one true revocation path) so a removal via an alert is audit-indistinguishable from
   any other parent rejection, and **Review Details** expands the stored explanation — content
   is never silently removed.
3. **Parent reporting.** `parent-report-service.ts` + `POST`/`GET /api/parents/reports` let a
   parent report any content in their own submission queue (optionally tied to a specific
   child) under the exact categories from PRODUCT_REQUIREMENTS.md. **Scope boundary, stated
   honestly:** every report starts and stays `SUBMITTED` — there is no moderation/validation
   workflow in this product yet (no reviewer role exists), so reports do not themselves
   trigger a re-score. "Validated reports become signals feeding future Supervision Score
   recalculation" (PRODUCT_REQUIREMENTS.md) describes a future capability once a validation
   workflow exists, not something faked here. A "Report this content" action lives on every
   `ContentCard`; a parent's own reports are visible under "Your Reports" on the Safety Alerts
   page.
4. Tests: 9 new API integration tests across three files (`viewing-history.test.ts`,
   `safety-alerts.test.ts`, `parent-reports.test.ts`) — device/playlist attribution, monotonic
   progress tracking with server-derived completion, a child unable to post progress against
   another child's row, a real re-score raising an alert end-to-end (with both Keep Approved
   and Remove resolutions) and respecting parent/parent isolation, and report submission +
   isolation + the submission-queue ownership check.

**Status: done**, verified end-to-end in a real browser session: registered a parent, approved
a submission, handed the device to a child, played it (the page accumulated visible time and
pinged progress in the background), signed back in as the parent, and confirmed the Viewing
Activity page showed the real device label ("Sixkid's device") and a non-zero watched
duration; reported the content from Approved Content and confirmed it appeared under Safety
Alerts' "Your Reports"; confirmed the Safety Alerts page's correct empty state ("No open
alerts") since nothing had re-scored during the session. The re-score-and-alert path itself
(crafting a metadata change and watching a `SafetyAlert` appear, then resolving it both ways)
is covered by the integration tests above rather than the live walkthrough, since triggering a
real one live would require either a second live submission of content whose provider-side
title actually changed, or a manual DB edit — both less informative than the deterministic
test.

## Milestone 7 — exact implementation plan (done, partial scope — see below)

PRODUCT_REQUIREMENTS.md names this milestone "Advanced AI analysis (transcript/audio/frame/
OCR)." Before building, we hit a real constraint: YouTube's Data API only allows downloading a
caption track under OAuth consent from the video's own owner — it doesn't scale to arbitrary
third-party videos — and there is no official API to pull audio or video frames without
downloading the video itself, which this project has avoided everywhere else (see "never
scrape, only official APIs" throughout Milestones 2–4). Asked how to handle the gap, the
decision was: build everything officially feasible, and additionally build transcript fetching
via a documented, deliberate exception — never audio transcription or frame sampling/OCR,
which have no non-scraping path at all. No new external credentials — everything below reuses
`YOUTUBE_API_KEY`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`.

1. **Creator/channel signals (official)** — `YouTubeContentProvider.fetchChannelSignals`
   (`packages/content-providers`) calls the official `channels.list` endpoint (same API key as
   everything else) for channel age, subscriber count, and video count. Deliberately a weak,
   corroborating signal only: `RuleBasedSupervisionScorer` never independently penalizes a
   brand-new channel (most are completely innocuous) — it only raises confidence on a
   `grooming_indicators` match the text already triggered, when the channel is also new/
   low-history. Verified live: a real `channels.list` call for Rick Astley's channel correctly
   found no corroboration needed (no grooming match existed to corroborate).
2. **External-link analysis (official, free)** — `scoring-service.ts` regexes `http(s)://` URLs
   out of the content's own description (already-fetched metadata, no new call) and feeds them
   to the already-built `external_link_risk` category from Milestone 5. Verified live: a real
   video description with 11 links correctly scored `external_link_risk` at 0/100.
3. **Thumbnail image analysis (official)** — a new `ThumbnailAnalyzer` interface in
   `packages/ai`, with the exact OpenAI-primary/Claude-fallback dual-provider architecture from
   Milestone 4's discovery translator (`OpenAIThumbnailAnalyzer`/`ClaudeThumbnailAnalyzer`/
   `FallbackThumbnailAnalyzer`/`createThumbnailAnalyzer`) — vision-capable structured output
   classifying the thumbnail against the fixed 20-category vocabulary. Zero ToS risk: the
   thumbnail URL is the same public, display-intended image this app already renders in the UI,
   never a scrape. Only run once per distinct piece of content (same dedup as every other score
   input), so cost is bounded the same way Milestone 4's discovery rate limit was designed
   around. Verified live: a real OpenAI vision call against the submitted video's real
   thumbnail correctly flagged nothing (a benign thumbnail).
4. **Transcript fetching (the one deliberate exception)** — `YouTubeContentProvider.
   fetchTranscript` reads the caption track list YouTube's own web player embeds in the public
   watch page (the same data the player itself uses, fetched the same way a browser would — no
   video/audio download, no auth bypass), then fetches the chosen track's timed-text URL. This
   is **not** a documented or supported API and could break or be blocked without notice —
   unlike every other integration in this project. Per the user's explicit requirement, it is
   isolated and **must never throw**: every failure mode (no captions, network error, YouTube
   blocking/rate-limiting the request, a changed page structure) resolves to `null`, so scoring
   always proceeds on whatever other signals succeeded. **Verified live, including the failure
   path**: a real transcript fetch against a real, heavily-captioned video returned a genuine
   `429` from YouTube in this environment — exactly the kind of breakage this method is
   documented to be exposed to — and scoring completed successfully anyway (943/1000, built
   from every other signal), with `transcript` correctly absent from `signalsUsed`. This is the
   honest, real-world proof of the fallback requirement, not just a mocked test case (the
   mocked success/failure paths are also covered in `deep-signals.test.ts` and
   `youtube-provider.test.ts` for determinism).
5. `ScoringInput` gained `creatorSignals` and `thumbnailFlags` (alongside the already-scaffolded
   `transcript`/`ocrText`/`externalLinksFound`); `RuleBasedSupervisionScorer` treats a
   thumbnail flag like a keyword match on whichever category it names. `scoring-service.ts`'s
   `gatherDeepSignals` fetches all three new signals best-effort, each in its own try/catch, so
   one failing (transcript, here) never blocks the others (channel signals, thumbnail
   analysis) or metadata-only scoring itself.
6. A modest new rate limit on `POST /content/submit` (60/hour) and `POST /playlists/import`
   (20/hour, tighter since one import can newly-score many videos in a single request) — cost
   is bounded per unique content (a re-submission is a cache hit), but a never-before-seen video
   can now trigger a real vision-model call, same cost-safety reasoning as discovery's limit.
7. Tests: 9 new unit tests for `fetchChannelSignals`/`fetchTranscript` (success, no-captions,
   malformed-HTML, network failure, missing-API-key paths — `youtube-provider.test.ts`), 15 new
   unit tests for the thumbnail analyzer classes + fallback + factory (`packages/ai`), 4 new
   scorer unit tests for thumbnail-flag and creator-signal-corroboration behavior
   (`packages/supervision-score`), and 8 new API integration tests proving graceful degradation
   end-to-end plus the positive path for each signal (`deep-signals.test.ts`,
   `deep-signals-channel-signals.test.ts` — split into its own file because
   `getProviderRegistry`'s module-level singleton caches its API key at first construction, so
   a test needing `YOUTUBE_API_KEY` configured can't share a file with one that needs it
   unconfigured).

**Status: done for everything officially feasible, plus transcript fetching as the one
explicit, documented exception** — see point 4 above for why, and for the real (not just
mocked) proof that it degrades safely when it breaks. **Audio transcription, frame sampling,
and OCR remain out of scope**, with no non-scraping path identified: audio/frame extraction
both require downloading the video itself, which this project will not do. Building these
would need either per-video OAuth consent from each video's own channel owner (impractical at
the scale of arbitrary third-party content) or a licensed, paid transcription/vision vendor the
operator would need to contract and legally clear — both are a future decision, not an
engineering gap closeable with the current credentials.

## Milestone 8 — exact implementation plan (done, split scope — see below)

PRODUCT_REQUIREMENTS.md names this milestone "Native mobile apps (iOS/Android)." Before
building, we hit a real constraint: this environment has no Xcode, no Android Studio, no
simulator, and no physical device — nothing here can actually run or verify a native app build.
Asked how to proceed (most kids watch on phones/tablets today, not desktops), the decision was:
build both. Make the web app itself fully mobile-first *now* — that's the thing families can
actually use on a phone or tablet today, in a normal browser, with zero app-store friction — and
additionally scaffold the native Expo/React Native project structure so a real native app has
somewhere to be built out later, honestly labeled as unverified rather than claimed working.

**Part A — the web app, made genuinely mobile-first:**

1. The parent dashboard's sidebar nav (`apps/web/src/app/(dashboard)/layout.tsx`) was
   `hidden ... sm:block` with **no mobile alternative at all** — a real, severe bug for any
   parent on a phone (zero way to navigate between dashboard sections below 640px). Fixed with
   a standard hamburger/drawer pattern that reuses the existing `NAV_ITEMS` data and closes
   itself on navigation; the desktop sidebar is untouched above `sm:`.
2. PWA installability: a `manifest.webmanifest`, real generated icon assets (192/512/maskable/
   apple-touch, rendered via the pre-installed headless Chromium as an ad-hoc rasterizer — no
   image-editing dependency needed), and `viewport`/`appleWebApp` metadata wired into
   `app/layout.tsx`. **Deliberately no service worker** — any caching here would risk
   undermining "a parent's approval revocation takes effect immediately, even mid-session," an
   already-tested Milestone 3 security invariant, and that's a tradeoff worth being explicit
   about rather than silently shipping offline support that could get it wrong.
3. The child player's action buttons (`apps/web/src/app/child/play/[contentId]/page.tsx`) used
   to wrap awkwardly (`flex flex-wrap`); now stack full-width on phones and go horizontal from
   `sm:` up, with the primary "Next Approved Video" action ordered first for thumb reach.
4. **Verified live, not just by typecheck** — a local Postgres instance, a real registered
   parent account, a real child profile, and real approved content were seeded, then driven
   through actual login/navigation/playback flows via Playwright at phone (390×844) and tablet
   (768×1024) viewport sizes: the hamburger drawer opening/closing, the dashboard sidebar
   appearing correctly at tablet width, and the child player's buttons stacking correctly on
   phone and sitting horizontally on tablet. All 148 existing tests plus lint and typecheck
   passed clean against the changes.

**Part B — native app scaffold (`apps/mobile`), explicitly unverified:**

1. A real, current (checked against the npm registry, not memorized/placeholder) Expo `~58.0.21`
   + React Native `0.88.1` + TypeScript project, added as a proper `pnpm` workspace member and
   depending on `@app/types` for shared Zod/TypeScript shapes.
2. Hand-rolled screen switching in `App.tsx` instead of a navigation library — every dependency
   added here is something nobody has verified actually works in this environment, so the
   scaffold stays as small as possible. Three UI-only stub screens (`LoginScreen`,
   `LibraryScreen`, `PlayerScreen` using `react-native-webview` for a YouTube embed, the same
   "official URL, no native SDK" approach as the web app's `<iframe>`), each explicitly
   commented as not wired to the real API.
3. Two gaps are called out honestly in `apps/mobile/README.md` rather than papered over:
   **native auth** (the web app's cookie-based sessions don't translate to React Native as-is;
   a real design — most likely issuing bearer tokens to native clients alongside, not instead
   of, the existing cookie sessions — needs its own explicit discussion, not a silent decision
   made while "just scaffolding"), and **Metro + pnpm workspace resolution** (`@app/types` ships
   raw TypeScript source with no build step; a `metro.config.js` sets up the standard Expo
   monorepo pattern, but whether Metro actually transforms that one workspace package from
   `node_modules` has not been run end-to-end — there's no device/simulator here to run it on).
4. `pnpm install` from the repo root resolves this new workspace member cleanly, and
   `pnpm --filter @app/mobile typecheck` passes — both actually verified here. Adding it also
   surfaced and fixed a real, pre-existing-shape pnpm/TypeScript monorepo bug: introducing a
   second major React version (19, for Expo) into the workspace caused pnpm's internal
   `.pnpm/node_modules` phantom-hoist slot for `@types/react` to arbitrarily resolve to v19 for
   files that reference it ambiently rather than via explicit import (`apps/web/src/app/
   layout.tsx`'s `children: React.ReactNode`), producing a real type error unrelated to any
   logic change. Fixed by switching that one annotation to an explicit
   `import type { ReactNode } from "react"` rather than fighting pnpm's hoisting behavior,
   which full-suite testing proved other packages (`@prisma/client`'s generated types,
   Fastify's plugin-augmented `reply.setCookie`) legitimately depend on.

**Status: done for the web app (built, live-verified, shipped) and done for the native scaffold
as a scaffold** (real versions, clean install, clean typecheck) — **not done, and not
claimed to be,** for an actually running/testable native app, which needs a real machine with
Xcode and/or Android Studio that does not exist in this environment.

## Milestone 9 — exact implementation plan (done, split scope — see below)

PRODUCT_REQUIREMENTS.md names this milestone "TV applications." Same constraint as Milestone 8:
this environment has no Roku device, no Apple TV simulator, no Android TV emulator, and no
Tizen/webOS SDK — nothing native-TV can actually be run or verified here. Asked how to proceed,
the decision (consistent with Milestone 8's "build both") was: build a genuinely working,
live-verified TV-remote-navigable experience inside the existing web app now, and additionally
scaffold a native TV app honestly labeled as unverified.

**Part A — `/tv`, a real 10-foot UI inside `apps/web`:**

1. Smart TV browsers (Tizen, webOS, Android TV) are standard web engines — a TV remote's D-pad
   delivers real `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` `KeyboardEvent`s, and its OK
   button activates whatever's focused exactly like a real `<button>`/`<a>` click. That makes a
   web-based TV experience something this environment actually can build and test, unlike a
   native TV app.
2. `apps/web/src/lib/tv-nav.ts`: a hand-rolled spatial-navigation hook
   (`useTvSpatialNav`) that moves focus to the nearest `[data-tv-focusable]` element in the
   pressed direction using real element positions (not a hardcoded grid shape), a back-key hook
   (`useTvBackKey`, Backspace/Escape → `router.back()`), and an auto-focus hook
   (`useTvAutoFocus`) that focuses a page's own first focusable element once its content loads.
   Deliberately does not reimplement Enter/Space activation — real `<button>`/`<a>` elements
   already do that natively, which is also what a real TV browser relies on.
3. `apps/web/src/app/tv/{page,playlists/[playlistId]/page,play/[contentId]/page}.tsx`: the same
   child session/library/playback backend as `/child`, rendered as a dark, large-text, large-card
   10-foot UI. `apps/web/src/components/tv-exit-keypad.tsx` is a TV-specific exit-to-parent flow
   — a D-pad-navigable on-screen numeric keypad, since a remote has no reliable text input,
   calling the same `/api/child/exit-to-parent` endpoint apps/web's phone/desktop popover does.
4. **Verified live, not just by typecheck** — a real parent account, child profile, and approved
   content/playlist were seeded, then the entire flow (home → playlist → video → back → the
   numeric-keypad exit-to-parent, ending in a real, successful API call) was driven **purely by
   keyboard events** (no mouse/click) via Playwright at a 1920×1080 viewport. This caught two
   real bugs before they shipped: the video player at `aspect-video` and full TV width rendered
   as tall as the whole 1080p screen by itself, pushing the action buttons off-screen with no
   way to scroll them into view by remote (fixed with a fixed viewport-relative height instead);
   and every page navigation reset focus to the header's "Parent sign-in" button (always first
   in DOM order) instead of that page's own content (fixed with `useTvAutoFocus`, called once
   each page's real content renders). Full typecheck/lint/148-test suite also passed clean.

**Part B — native TV app scaffold (`apps/tv`), explicitly unverified:**

1. A real, current (checked against the npm registry) Expo `~58.0.21` +
   [`react-native-tvos`](https://github.com/react-native-community/react-native-tvos) `0.88.0-0`
   (installed via npm's package-alias syntax, `"react-native": "npm:react-native-tvos@..."`,
   the documented way existing react-native-tvos projects set this up) +
   `@react-native-tvos/config-tv` `0.1.7` (the companion Expo config plugin, maintained by Expo
   core contributors) project. This is the real, standard way to target **both** Apple tvOS and
   Android TV/Fire TV from **one** codebase — unlike phone platforms, TV platforms don't share a
   runtime, so this is a separate app from `apps/mobile`, not an extension of it.
2. Same hand-rolled-navigation philosophy as `apps/mobile`: no extra dependencies beyond what's
   needed. Three UI-only stub screens using `react-native-tvos`'s real focus-engine primitives
   (`TVFocusGuideView`, `hasTVPreferredFocus`, `onFocus`/`onBlur` focus-ring styling) — the
   native equivalent of what Part A had to hand-build in plain DOM/keyboard terms, except here
   the platform's own focus engine does the spatial-navigation work.
3. `pnpm install` resolves cleanly with zero peer-dependency warnings, `node_modules/react-native`
   genuinely resolves to the `react-native-tvos` package contents, and
   `pnpm --filter @app/tv typecheck` passes — which only works because `hasTVPreferredFocus`/
   `TVFocusGuideView` type-check against the TV fork's own type definitions, not stock
   `react-native`'s. All three actually verified here; running the app was not.
4. The same native-auth design gap as `apps/mobile` is called out rather than silently decided
   (see `apps/tv/README.md`).
5. **Roku is deliberately not scaffolded.** Roku channels are built in BrightScript, a
   proprietary language/runtime with zero code overlap with this project's TypeScript/React
   stack — scaffolding it honestly would mean writing an entire second application from scratch
   in an unrelated language, which is its own standalone engineering decision (effort vs. this
   product's actual audience on Roku), not an extension of the work done here.

**Status: done for the web TV experience (built, live-verified, shipped) and done for the native
scaffold as a scaffold** (real versions, clean install, clean typecheck) — **not done, and not
claimed to be,** for an actually running/testable native TV app (needs a real Apple TV/Android TV
simulator or device) or for Roku at all (a from-scratch, separate-language project, out of scope
until explicitly requested).

## Milestone 10

Unchanged from PRODUCT_REQUIREMENTS.md's list; will get this same treatment (a short plan
reviewed before implementation, external-credential stop points called out explicitly) when
started, rather than being built ahead of the current milestone.

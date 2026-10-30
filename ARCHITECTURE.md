# Architecture

## Guiding constraint

The child client is **never trusted to enforce safety rules**. Every allow/deny decision
(what content exists, what a child may open, what a child may play next) is computed and
enforced **server-side**, in `services/api`. Client apps (web, future mobile, future TV) are
thin renderers of what the API already decided is safe to show. This is what makes "closed
content environment" actually closed, rather than a UI convention a modified client could
bypass.

## Monorepo layout

```
/apps
  /web            Next.js 14 (App Router). Two route groups sharing one deployable:
                    (parent)  — dashboard, requires parent session
                    (child)   — player/library UI, requires child session
  /mobile         Expo/React Native scaffold — consumes the same REST API (Milestone 8)
  /tv-future      Placeholder — same API, thin client (Milestone 9)

/packages
  /types                Zod schemas + inferred TS types shared by API and clients.
                         This is the API contract; API and clients both import it so
                         request/response shapes can never silently drift apart.
  /database             Prisma schema (packages/database/prisma/schema.prisma) + a thin
                         typed client wrapper. The ONLY package that talks to Postgres.
  /auth                 Password hashing (argon2), JWT issuing/verification, RBAC guards,
                         PIN verification, MFA (TOTP) primitives.
  /content-providers    `ContentProvider` adapter interface (see below) + implementations.
                         Only this package is allowed to call an external content API.
  /supervision-score    `SupervisionScorer` interface + category-scorer contracts +
                         an MVP rule-based implementation. Scoring is versioned; nothing
                         is computed synchronously inside a request that mutates data
                         users depend on without recording a `ScoreVersion` row.
  /ai                   Natural-language discovery brief → structured `DiscoveryQuery`.
                         Adapter interface so the LLM provider is swappable.
  /config               Shared tsconfig, eslint config, and a validated env-var schema.

/services
  /api            Fastify. Owns the database connection, all business logic, and all
                  external API calls. Nothing else in the system holds credentials.
```

### Why this layout

- **One API, many thin clients.** Web, mobile, and TV are all "just" clients of
  `services/api`. Building mobile/TV later means writing a renderer against an API that
  already exists and already enforces every safety rule — not re-implementing safety logic
  per platform (which is how these invariants rot).
- **Adapters isolate volatility.** Content providers, AI providers, and the scoring model
  all change over time (new providers, model upgrades, provider ToS changes). Each lives
  behind an interface in its own package so a swap is a new adapter file, not a rewrite.
- **The database package is the schema's only owner.** Every other package/service imports
  generated types from `@app/database`; nobody hand-writes a second copy of the schema.

## Request flow example — parent approves a video

1. Parent's browser calls `POST /api/parents/children/:childId/approvals` with a
   `contentId` (web app never talks to Postgres or to YouTube directly).
2. `services/api` verifies the caller is a parent session, and that `childId` belongs to
   that parent's account (see RBAC below).
3. API writes a `ParentApproval` row and a derived `ChildContentPermission` row.
4. The child client's next `GET /api/child/library` reflects the change immediately — there
   is no cache layer that could serve stale, unapproved content.

## AuthN/AuthZ model

Two disjoint session types, never interchangeable:

- **Parent session** (JWT, short-lived access token + rotating refresh token, `role: PARENT`,
  `parentAccountId` claim). Required for every `/api/parents/*` route.
- **Child session** (JWT, `role: CHILD`, `childId` + `parentAccountId` claims, longer-lived
  since a child has no way to silently refresh one — issued only by a parent action: "hand
  this device to this child," `POST /api/parents/children/:childId/device-session`). Required
  for every `/api/child/*` route, and scoped to exactly one `childId`; a child token for
  child A is rejected by every endpoint that resolves data for child B.

A single Fastify `preHandler` guard (`packages/auth`) decodes the token, checks its role
against the route's declared required role, and — for child routes — checks the token's
`childId` against the resource being requested, on every request. This is what the
"child cannot access another child's content" and "child cannot reach parent settings"
tests in `services/api` verify directly against the HTTP layer, not just the UI.

Parent and child sessions share the same cookie names (`access_token`/`csrf_token`), by
design: starting a child session overwrites whatever parent session cookie was there, so a
browser holds exactly one live session at a time, matching the "hand off the device" mental
model literally. Critically, starting a child session also **revokes the parent's refresh
token server-side** (not just clearing its cookie) — an httpOnly cookie is still visible to
anyone with devtools access to the physical device, so clearing it client-side alone would
leave a captured token replayable against `/api/auth/refresh` to mint a fresh parent session
after handoff. "Parent PIN sign-in" (`POST /api/child/exit-to-parent`) reverses the handoff:
it requires an active child session to even attempt, verifies the parent's PIN, and — on
success — issues a complete fresh parent session (access + refresh + CSRF), the same as a
normal login.

## Content provider adapters

```ts
interface ContentProvider {
  readonly id: string; // 'youtube' | 'vimeo' | 'website' | ...
  canHandle(url: string): boolean;
  fetchVideoMetadata(url: string): Promise<ProviderVideoMetadata>;
  fetchPlaylistItems(url: string): Promise<ProviderVideoMetadata[]>;
  getEmbedInfo(providerRef: string): EmbedInfo; // how the child client plays it back
}
```

MVP ships the interface plus a `youtube` adapter (YouTube Data API v3 — official API, no
scraping) implemented in Milestone 2. A `website` "adapter" is a thin allowlist entry (domain
+ optional path rules) rather than a metadata fetch. Adding Vimeo or an educational
platform later is a new file implementing the same interface; nothing else in the system
changes.

## Supervision Score engine

```ts
interface SupervisionScorer {
  readonly modelVersion: string;
  score(input: ScoringInput): Promise<SupervisionScoreResult>;
}
```

`ScoringInput` carries whatever signals are available for a piece of content (metadata,
provider "made for kids" flag, transcript if fetched, etc.) `SupervisionScoreResult` carries
the overall 0–1000 score, a per-category breakdown, confidence, and an explanation.

Milestone 5 implements this with `RuleBasedSupervisionScorer` (`modelVersion:
"rule-based-v1"`) — transparent, metadata-only: title/description keyword matching per
category plus `providerMadeForKids` as one input affecting only `age_appropriateness` (never
adopted as the score itself). Every category starts at a low-confidence neutral baseline and
is only marked down, with confidence raised accordingly, when a specific signal is found —
never claiming certainty a title and description alone can't support. It already reads
`ScoringInput`'s later-milestone fields (`transcript`, `ocrText`, `externalLinksFound`)
whenever they happen to be populated, so frame/transcript/audio analysis (Milestone 7) plugs
in as additional `ScoringInput` producers with no scorer or storage change.

`services/api/src/services/scoring-service.ts` is the only caller: `ensureContentScored`
scores a piece of content once, synchronously, right after it's first created (single-URL
submission, playlist import, or AI discovery) — `Content` is shared globally across every
family, so this is a property of the content, not of any one parent's relationship to it — and
persists the result as the content's first `ScoreVersion` (append-only; nothing yet triggers a
re-score of already-scored content). `attachSupervisionScores` batch-enriches a list of
`ContentSummary` with their current score in one query, used wherever a parent reviews content
(Pending Reviews, Approved Content, Discover Content results) plus the dedicated
`GET /api/parents/scores` route behind the Supervision Scores dashboard page — every piece of
content approved for at least one child, worst-score-first, with a "Why this score?" expand
showing the full category breakdown. The storage/versioning model (`ScoreVersion`) does not
change when the underlying model does — only `signalsUsed` grows.

## AI discovery

```ts
interface DiscoveryTranslator {
  translate(brief: string, context: DiscoveryContext): Promise<DiscoveryQuery>;
}
```

Implemented in Milestone 4 using each provider's structured-output support — guaranteed
schema-valid JSON against one shared Zod schema, rather than hand-parsed free text — behind
this interface so the LLM provider stays swappable. Discovery is funded by one shared,
operator-paid key serving every parent, not bring-your-own-key, so cost per call is a first-
class concern: `createDiscoveryTranslator({ openaiApiKey, openaiModel, anthropicApiKey })`
builds an **OpenAI-primary, Claude-fallback** composite:

- `OpenAIDiscoveryTranslator` (primary) — OpenAI's Responses API (`client.responses.parse` +
  `zodTextFormat`), default model `gpt-5.4-mini` (a low-cost tier appropriate for high-volume,
  shared-key traffic; overridable via `OPENAI_MODEL`).
- `ClaudeDiscoveryTranslator` (fallback only) — `client.messages.parse` + `zodOutputFormat`,
  `claude-opus-5-5`; only invoked when the primary's call throws.
- `FallbackDiscoveryTranslator` wraps both: primary first, fallback on any error, and only
  throws (naming both failures) if the fallback also fails.

With only one of `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` configured, the factory returns that
provider alone (no fallback). With neither, it returns `undefined` and the discovery route
fails honestly with a 503, the same pattern as a YouTube submission without
`YOUTUBE_API_KEY` — there is no rule-based fallback that would risk silently returning worse
results without saying so. Because every call here spends real money from the shared key, the
discovery route also carries its own stricter rate limit (10 requests/hour per IP), separate
from the app's default.

The structured query's `topics` become a search string against the relevant
`ContentProvider`'s own `searchVideos` (YouTube's official `search.list`, always with
`safeSearch: strict` as a defense-in-depth input filter — never a scrape). Every candidate is
persisted as `Content` + an `AIRecommendation` row before a parent ever sees it; nothing here
touches `ParentApproval` or `ChildContentPermission` — per PRODUCT_REQUIREMENTS.md, an AI
suggestion only reaches a child once the parent explicitly approves it, exactly like any
other submitted content. A candidate's `matchReason` is reported honestly as which derived
search terms found it (YouTube's own relevance ranking), not a per-video explanation an LLM
invented — that keeps the cost to one Claude call per search, not one per candidate.

## Viewing history, safety alerts, and parent reporting (Milestone 6)

**Viewing history** is written at two points: `getPlaybackInfo` creates a `ViewingHistory` row
when a child starts playing something (recording the `Device` the handoff session created and
the `PlaylistItem` if played from one), and the child player pings
`POST /api/child/viewing-history/:id/progress` with wall-clock time it's been open and
visible. That's a deliberate, documented simplification: this product doesn't integrate any
provider's player API, so it can't observe pause/seek within a video — `positionSeconds` is
time-open, not playback position. The server, never the client, derives
`completionPercentage` from the content's own already-known `durationSeconds`, and only ever
moves `durationWatchedSeconds` forward, so an out-of-order or duplicate ping can't erase
progress already recorded. `services/api/src/services/viewing-history-service.ts` reads this
same table for the parent-facing activity timeline — nothing is synthesized at read time.

**Safety alerts** close the loop the Supervision Score engine's versioning model was built
for. `scoring-service.ts`'s `ensureContentScored` doesn't just score once anymore — it re-runs
the scorer every time it's called (at every content-creation *and* content-refresh call site)
and compares the result to what's on file. The realistic trigger for a changed result is
`upsertVideoContent` refreshing an existing `Content` row's title/description on a playlist
re-import or URL re-submission — a creator editing their video, not anything fabricated. A
changed result always appends a new `ScoreVersion` (append-only, per SUPERVISION_SCORE.md);
when that change is worse for a specific child who currently holds a `ChildContentPermission`
for the content (their risk band dropped, or the score crossed below their own
`supervisionScoreMinimum`), a `SafetyAlert` is raised for that child. Resolving one reuses
`decideApproval` for "Remove" — there is no second code path that can revoke access — so an
alert-driven removal is indistinguishable, audit-wise, from any other parent rejection.

**Parent reporting** is submission-only in this milestone: `parent-report-service.ts` lets a
parent report content they've submitted, under PRODUCT_REQUIREMENTS.md's exact categories.
Every report starts and stays `SUBMITTED` — there is no moderation/validation role or workflow
in this product yet, so reports don't themselves trigger a re-score. That's a stated scope
boundary, not an oversight: "validated reports feed future Supervision Score recalculation"
describes a capability a validation workflow would need to exist first.

## Deployment shape (recommended, not yet provisioned)

- `services/api` → any Node host (Railway/Fly/Render) with a managed Postgres
- `apps/web` → Vercel (or the same host as the API)
- Secrets live only in the API's environment; the web app receives no provider credentials —
  see SECURITY_AND_PRIVACY.md.

## What Milestone 1 actually wires up

Database schema (all entities), `packages/auth`, `packages/types`, the API's auth + parent +
child-profile routes, and the web app's parent auth screens + dashboard shell + child-profile
management. `content-providers`, `supervision-score`, and `ai` exist in this milestone as
interfaces and scaffolding only — real adapters land in Milestones 2, 5, and 4 respectively.

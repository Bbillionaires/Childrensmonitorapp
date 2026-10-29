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
the overall 0–1000 score, a per-category breakdown, confidence, and an explanation. The MVP
implementation (Milestone 5) is a transparent, rule-based scorer over metadata signals only;
frame/transcript/audio analysis are added later as additional `ScoringInput` producers behind
the same interface — the storage/versioning model (`ScoreVersion`) does not change when the
underlying model does.

## AI discovery

```ts
interface DiscoveryTranslator {
  translate(brief: string, context: DiscoveryContext): Promise<DiscoveryQuery>;
}
```

Implemented against the Claude API (`claude-opus-5-5`) in Milestone 4 using structured
outputs (`client.messages.parse` + a Zod schema), so the translation is guaranteed
schema-valid JSON rather than hand-parsed free text — behind this interface so the LLM
provider stays swappable. Without `ANTHROPIC_API_KEY` configured, the factory
(`createDiscoveryTranslator`) returns `undefined` and the discovery route fails honestly
with a 503, the same pattern as a YouTube submission without `YOUTUBE_API_KEY` — there is no
rule-based fallback that would risk silently returning worse results without saying so.

The structured query's `topics` become a search string against the relevant
`ContentProvider`'s own `searchVideos` (YouTube's official `search.list`, always with
`safeSearch: strict` as a defense-in-depth input filter — never a scrape). Every candidate is
persisted as `Content` + an `AIRecommendation` row before a parent ever sees it; nothing here
touches `ParentApproval` or `ChildContentPermission` — per PRODUCT_REQUIREMENTS.md, an AI
suggestion only reaches a child once the parent explicitly approves it, exactly like any
other submitted content. A candidate's `matchReason` is reported honestly as which derived
search terms found it (YouTube's own relevance ranking), not a per-video explanation an LLM
invented — that keeps the cost to one Claude call per search, not one per candidate.

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

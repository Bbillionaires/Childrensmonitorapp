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
| `ANTHROPIC_API_KEY` | Milestone 4 — AI-assisted discovery (natural language → structured query) | console.anthropic.com → API keys | `ANTHROPIC_API_KEY` |
| `RESEND_API_KEY` (or equivalent) | Milestone 1's password-reset email delivery in a real (non-local) environment | resend.com (or any transactional email provider) | `RESEND_API_KEY` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Milestone 1 — session signing | Generate locally (`openssl rand -base64 48`); not a third-party account | same names |

Until `YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY` are supplied, `content-providers` and `ai`
ship as clearly labeled interfaces/stubs — no fabricated metadata, no fake AI responses are
returned as if real.

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

## Milestones 4–10

Unchanged from PRODUCT_REQUIREMENTS.md's list; each will get this same treatment (a short
plan reviewed before implementation, external-credential stop points called out explicitly)
when started, rather than being built ahead of the current milestone.

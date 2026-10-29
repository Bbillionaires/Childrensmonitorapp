# Security & Privacy

This product handles children's data and controls what children can see. Security and
privacy are load-bearing, not a checklist added at the end.

## Data minimization (COPPA-aligned)

We do not collect, for a `Child` profile:
- Exact geolocation (not collected at all in the MVP)
- Any identifier beyond a first name/nickname the parent chose
- Voice recordings or images of the child (avatars are parent-selected/uploaded illustrations,
  not photos, and the MVP ships with a preset avatar set rather than user-uploaded images)
- Advertising identifiers, ever, from a child session
- An independent login credential (email/password) for the child — see below

We do collect the minimum needed to run the product: age range (not birthdate, unless a
parent chooses to enter one for scheduling precision), interests/category preferences the
parent sets, and viewing history scoped to enforcing limits and showing the parent an
activity timeline. Viewing history is never used for advertising and is not shared with
content providers beyond what is inherently required to play the content back (e.g. YouTube's
own player receiving a video ID).

## Account model enforces the parent/child boundary structurally

A `Child` row has no password. There is no "child forgot password" flow to attack because
there is no independent child credential — a child's device session is issued only by a
parent action (in-app handoff, or a parent-configured short device PIN scoped to exactly one
child and one device). This removes an entire class of credential-stuffing and reset-flow
attacks against children's accounts by construction, not by policy.

## AuthN

- Parent passwords: Argon2id hashing (memory-hard, resistant to GPU cracking), never
  reversible, never logged.
- Access tokens: short-lived JWT (15 min), signed with a server-held secret
  (`JWT_ACCESS_SECRET`), never containing the password hash or any child PII beyond a
  `childId` reference.
- Refresh tokens: longer-lived, rotated on use, stored hashed, revocable per-device (tied to
  `Device`), so a stolen refresh token can be invalidated without forcing every device to
  re-authenticate.
- Password reset: single-use, expiring (15 min), cryptographically random token, emailed —
  never returned in an API response, never guessable, invalidated after first use.
- MFA: TOTP secrets encrypted at rest (`mfaSecretEncrypted`); architecture supports it from
  Milestone 1, enablement flow ships when an authenticator UX is prioritized.
- Parent PIN: a short numeric code, itself hashed, used only for in-session re-auth (e.g.
  confirming a settings change or switching from a child's device view back to the parent
  dashboard) — never a substitute for the full password on a new device.
- Biometric auth: deferred to native platforms (Milestone 8/9) where the OS provides a real
  secure enclave; the web MVP does not fake biometric auth in a browser.

## AuthZ / RBAC

Two roles, `PARENT` and `CHILD`, enforced by a single guard shared by every route
(`packages/auth`), not re-implemented per-endpoint:
- Every `/api/parents/*` route requires a `PARENT` session and additionally checks that the
  resource (a `childId`, a `contentId`, etc.) belongs to that parent's own `parentAccountId`
  — one parent can never read or mutate another parent's data.
- Every `/api/child/*` route requires a `CHILD` session and checks the token's own `childId`
  against the resource being requested — a session for child A gets a 403 on any resource
  scoped to child B, even within the same family.
- No route allows a `CHILD` token to reach anything under `/api/parents/*`; this is enforced
  by role check, not by the child app simply not showing a link.
- These boundaries are covered by automated tests in `services/api` (see the Testing section
  of IMPLEMENTATION_PLAN.md) — they are the tests explicitly called out in the product spec
  as non-negotiable.

## Secrets handling

- All third-party credentials (database URL, JWT signing secrets, future YouTube/Anthropic/
  email-provider keys) live only in `services/api` environment variables, validated at boot
  by a zod-based env schema (`packages/config`) that fails fast on a missing/malformed
  secret rather than running with an undefined key.
- `apps/web` never receives a provider API key. Any data the web app needs that would
  otherwise require a client-side key (e.g. an embed) is proxied or pre-resolved by the API.
- `.env` is gitignored; `.env.example` documents every variable name and what it's for,
  with no real values.
- Secrets are never written to logs or `AuditLog` metadata.

## Input handling

- Every request body is validated against a zod schema from `packages/types` before it
  reaches business logic — malformed input is rejected at the boundary, not defensively
  checked deep in a handler.
- Prisma's parameterized queries are the only way the API touches the database — no raw SQL
  string concatenation.
- URL submission (Milestone 2) validates scheme (https only) and resolves via the matching
  `ContentProvider` adapter before any fetch; the API itself never renders arbitrary
  parent-submitted HTML.
- Rate limiting is applied per-IP and per-session at the Fastify layer (`@fastify/rate-limit`)
  on authentication and content-submission routes specifically, since those are the highest
  abuse-value endpoints (credential stuffing, scraping-by-proxy).
- CSRF: the web app uses same-site, HTTP-only cookies for session transport (not
  `localStorage`) plus a CSRF token on state-changing requests, since cookie-based auth is
  otherwise CSRF-exposed.

## Audit logging

Every sensitive parent action — child creation/deletion, approval/rejection, threshold
changes, MFA enable/disable, password reset completion — writes an immutable `AuditLog` row
(actor, action, target, timestamp, no secrets). There is no update or delete path for
`AuditLog` in the API; it exists to answer "who approved/changed what, when" during a safety
review.

## Session management

- Parent sessions are per-device (`Device` row), independently revocable ("log out this
  device" without logging out others).
- Child sessions are longer-lived than a parent's (a child has no way to silently refresh
  one) but still bounded, and are only ever created by an explicit parent "hand off this
  device" action — never a standing credential a child logs into independently.
- Handing off a device **revokes the parent's refresh token server-side**, not just the
  cookie. Clearing a cookie is a client-side instruction the browser can choose to honor; the
  cookie's raw value is still visible to anyone with devtools/physical access to the device
  (httpOnly only blocks `document.cookie` JS access, not a human looking in devtools), so a
  captured value must be made unusable at the database, not just removed from view.
- "Parent PIN sign-in" from child mode requires an active child session to even attempt (it's
  a route under `/api/child/*`), so the PIN can't be probed without first holding a
  legitimate child-mode browser session.

## Public API surface

`services/api` exposes no unauthenticated route beyond `POST /api/auth/login`,
`POST /api/auth/register`, and `POST /api/auth/password-reset/*` — every other route requires
a valid session. Child data is never reachable through a public/unauthenticated endpoint,
including the future commercial Supervision Score API, which is scoped to content metadata
the parent submitted, not child profile data, and requires its own API-key auth + billing
before Milestone 10 exposes it.

## Encryption

- In transit: TLS everywhere (enforced at the hosting layer — Vercel/Railway/Fly all
  terminate TLS by default; local dev is HTTP only).
- At rest: managed Postgres provider encryption at rest (default on Railway/Supabase/RDS);
  application-level encryption additionally applied to MFA secrets specifically, since a
  raw TOTP secret is equivalent to a second factor if leaked.

## Legal/privacy considerations to revisit with counsel before launch

- COPPA verifiable parental consent flow (the MVP's account model — child profiles only
  exist under a verified parent account — supports this, but a formal VPC mechanism, e.g.
  a small credit-card charge or ID-verification step, is a legal decision, not an
  engineering default we should silently pick)
- State-level children's privacy laws (e.g. California SB-976, various state age-appropriate
  design code acts) that may impose additional requirements beyond COPPA
- Data retention policy for viewing history and audit logs (currently retained indefinitely
  in the schema; a retention/deletion policy is a product + legal decision)
- Data processing agreements with any third-party content/AI provider before sending even
  metadata (title/description) off our infrastructure

# School Seats + Structured Learning Queue (Milestone 11)

A third, independent product on top of this app: a school (or any organization) pays a
seat-based monthly subscription and sponsors Family Safety subscriptions for its families —
plus an opt-in content-sequencing mode that interleaves approved "fun" videos with approved
"learning" videos on a decaying schedule.

These are two related but separable features:

1. **School seats** — billing and access provisioning.
2. **Structured Learning Mode** — a per-child playback queue, usable by any parent (school
   seat or not).

## School seats

### Signing up

1. `POST /api/schools/register` with `{ schoolName, adminName, email, password }` — creates a
   school's own login identity (`SchoolAdminAccount`, a fully separate profile type from
   `ParentAccount`, mirroring it exactly) and a `SchoolAccount` row with `seatCount: 0` and
   `status: INCOMPLETE`. `POST /api/schools/login` and `/api/schools/logout` work the same way
   a parent's `/api/auth/*` routes do, on the same cookie names — a browser can only be
   actively logged in as one role at a time, the same limitation a parent/child handoff
   already has.
2. `POST /api/schools/checkout-session` with `{ seatCount }` (authenticated as the school
   admin) — a Stripe Checkout subscription at `STRIPE_SCHOOL_PRICE_ID` (a **per-seat** price
   configured in the operator's own Stripe Dashboard; this codebase never hardcodes a dollar
   amount) with `quantity: seatCount`, so the total charged is `price × seats`.
3. Once payment succeeds, the webhook (`POST /api/billing/webhook`, shared with the parent and
   commercial-API tiers, dispatched by `ownerKind`) activates the `SchoolAccount` and sets its
   `seatCount` **from Stripe's own subscription quantity**, never from anything the admin
   asked for client-side — resizing the live subscription later still only requires buying a
   new one at this stage (there's no in-place quantity-change route yet, the same scope the
   parent/commercial tiers started with).
4. `GET /api/schools/me` → `{ id, name, contactEmail, status, seatCount, seatsUsed }` for the
   admin's own dashboard.

### Inviting parents

- `POST /api/schools/invites` with `{ email }` (school admin session) — refused with `409` if
  `seatsUsed >= seatCount` (counting `PENDING` and `ACCEPTED` invites). On success, an email is
  sent to that address with a link to `/school-invite/:token`; the raw token is never returned
  by any API response or shown in any dashboard, the same "shown once, never again" discipline
  as every other secret in this app (API keys, password-reset tokens) — only its SHA-256 hash
  is ever stored (`SchoolSeatInvite.tokenHash`).
- `GET /api/schools/invites` lists the school's invites and their status for the dashboard.
- The invited parent calls `GET /api/parents/school-invites/:token` (a preview — school name
  and invite status, nothing else) and, once logged in (or freshly registered), `POST
  /api/parents/school-invites/:token/accept`. Both are deliberately **not** gated by
  `requireActiveSubscription` — accepting an invite is exactly how a parent with no
  subscription at all becomes entitled, so gating it on "already has one" would make it
  uncallable for the one case it exists for.
- Accepting sets `ParentAccount.schoolAccountId`; from then on `subscription-gate.ts`'s
  `requireActiveSubscription` treats that parent as entitled whenever the `SchoolAccount`
  itself is `ACTIVE`/`TRIALING`, in addition to (never instead of) any personal
  `ParentSubscription` they might also have. **The parent is never charged for a school
  seat.** The seat limit is re-checked at acceptance time too, not just when the invite was
  sent, in case seats purchased shrank in between.
- A parent already linked to a school cannot accept a second invite (`409`); an invite that's
  already been accepted, revoked, or has expired is refused the same way.

## Structured Learning Mode

Independent of school seats — any parent can turn this on for any child; it has nothing to do
with whether that parent is on a school seat.

### Turning it on

Two per-child toggles (`PATCH /api/parents/children/:childId`):

- `structuredLearningModeEnabled` (default `false`) — off, nothing changes: the child keeps
  today's free-choice approved library exactly as it was.
- `structuredLearningGateEnforced` (default `true`, meaningless while the mode itself is off)
  — on, the next batch of fun videos is genuinely locked until the required learning video is
  watched; off, it's a soft suggestion the child can skip.

### Tagging content

Whoever approves content for a child (`POST /api/parents/children/:childId/decisions` or its
bulk sibling) can pass `isLearningContent: true` and a `subject` (`MATH` / `READING` /
`SCIENCE` / `SOCIAL_STUDIES` / `LANGUAGE_ARTS` / `OTHER`). This is **always manual** — never
AI-inferred — stored on `ChildContentPermission`, the same per-child grant record the child's
library already reads from.

### The queue

Starts each new child device-handoff session at **3 fun videos** before a learning video is
due, then **2**, then **1** — holding at 1-for-1 for the rest of that session once it gets
there. "Session" is not a concept this app invented for this feature: it's exactly one
`Device` row, and a brand-new device-handoff already creates a fresh one (see
`child-session-service.ts`) — so a new handoff naturally restarts the decay at 3, with no
extra bookkeeping. A piece of content counts as "watched" once its recorded completion crosses
90% (`WATCHED_COMPLETION_THRESHOLD` in `learning-queue-service.ts`) — watching a learning video
always advances the decay, even "early," before the current fun quota is actually met; a child
getting ahead on learning content is never penalized for it.

- `GET /api/child/learning-queue` → `{ enabled, gateEnforced, phase, funRemainingBeforeLearning,
  funCandidates, learningCandidates }`. Always returns `enabled: false` (with empty candidate
  lists) rather than erroring when the mode is off, so the player can call it unconditionally.
- `GET /api/child/content/:contentId/play` is re-checked at the exact moment of playback (the
  same principle as the underlying approval check it already does) — attempting to play a fun
  video while a learning video is due and the gate is enforced is refused with `409
  {"code":"LEARNING_VIDEO_REQUIRED"}`. The learning video itself is never blocked.

## What's real vs. what needs the operator's own Stripe account

Built and typechecked against the same real patterns as the parent/commercial-API tiers
(package-boundary-mocked Stripe in unit tests, real integration tests against a seeded
Postgres for seat limits, invite accept, entitlement, and the full queue decay/reset/gate
behavior — see `services/api/src/test/school.test.ts` and `learning-queue.test.ts`). **Not
verified end-to-end here**: this sandbox has no local Postgres/Docker available, so these
tests were written and typechecked but not actually executed against a real database — run
them (`pnpm --filter @app/database db:migrate && pnpm --filter @app/database db:seed && pnpm
--filter @app/api test`) before relying on this in production. Supplying
`STRIPE_SCHOOL_PRICE_ID` (a real per-seat Price configured in the operator's own Stripe
Dashboard) is what's needed to verify school checkout live, the same pattern every other
Stripe price in this app already follows.

**Deliberately out of scope for this pass** (not stubbed, simply not built):
- Resizing an existing school's seat count in place (only a brand-new checkout is supported).
- Bulk approval UI tagging content as learning/subject (only the single-item approval flow has
  this control; bulk-approved content is simply never tagged as learning).
- The TV child surface (`/tv/play/...`) does not show queue/gate state — only the main web
  child player (`/child/play/...`) does.
- A school admin's password-reset flow (parents have one; school admins currently don't).

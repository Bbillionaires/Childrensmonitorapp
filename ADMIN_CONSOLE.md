# Admin Console + Curated Playlist Marketplace (Milestone 12)

A platform operator's own internal console — a third kind of login alongside a parent's and a
school admin's — for three things:

1. **Manually add subscribers** and send them a Stripe payment link (never a raw card form).
2. **Act on a subscriber's behalf** — see their children's playlists and pending review
   queue, remove content, approve/reject — for subscribers who aren't comfortable doing it
   themselves.
3. **Curate playlists** that parents can browse and add to their own library from a
   marketplace, the same way they'd import one of their own.

## The admin role

`User.role` already had an `ADMIN` enum value (unused until now). An admin has no separate
profile table the way `ParentAccount`/`SchoolAdminAccount` are — `role === "ADMIN"` *is* the
identity — so `AdminSessionClaims` is just `{ role: "ADMIN", userId }`.

There is **no public admin registration endpoint**. The first (and any subsequent) admin
account is provisioned once by `prisma/seed.ts` from two env vars:

```
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=a-real-password
```

The seed script (which already runs on every Railway deploy — see the `db:seed`-in-
`startCommand` change) upserts this account idempotently: if a `User` with that email already
exists, it's left alone rather than having its password silently reset on every deploy. Unset
either var and admin provisioning is skipped entirely, same optionality as every other
operator-configurable credential in `packages/config/src/env.ts`.

Sign in at `/admin/login`. Sessions work exactly like a parent's or school admin's
(`/api/admin/login`, `/refresh`, `/logout`, httpOnly `access_token`/`refresh_token` cookies,
the same CSRF double-submit pattern) — see `admin-auth-service.ts`.

**A subtlety this surfaced and fixed**: every role's refresh token lives in the same
`RefreshToken` table and shares the same cookie path, so the web app's root-level parent
`AuthProvider` firing its background `GET /api/parents/me` check on an admin or school-admin
page would otherwise hit `/api/auth/refresh` with that account's own refresh token — which
used to get **rotated (revoked) before** the endpoint checked whether the resulting account
actually had a `ParentAccount`, silently burning a perfectly good admin/school-admin refresh
token on a stray cross-role request. `refreshSession`/`refreshSchoolAdminSession`/
`refreshAdminSession` now all check role membership **before** rotating, so a cross-role
refresh attempt fails without consuming the token it was never meant for.

## Managing subscribers

- `GET /api/admin/subscribers?search=` — list parents (name, email, subscription status,
  child count), optionally filtered.
- `POST /api/admin/subscribers` with `{ displayName, email }` — creates a `User` +
  `ParentAccount` with a random, never-returned, never-logged password, then immediately sends
  the existing role-agnostic password-reset email so the new parent sets their own. An admin
  never knows or chooses a subscriber's password.
- `POST /api/admin/subscribers/:parentAccountId/payment-link` — **the only payment flow an
  admin has.** This generates a Stripe Checkout URL (reusing the exact same
  `createParentCheckoutSession` a self-service parent's "Subscribe" button calls, including its
  first-subscription trial logic) and emails it to the subscriber. The admin console **never**
  collects a card number itself — completing payment always happens on Stripe's own hosted
  page. The URL is also returned to the admin so it can be sent another way (e.g. read aloud
  over the phone).
- `GET /api/admin/subscribers/:parentAccountId/children`,
  `GET .../playlists`, `GET .../children/:childId/queue`,
  `DELETE .../playlists/:playlistId/items/:itemId`,
  `POST .../children/:childId/decisions` — the same reads/actions a parent's own dashboard
  uses (`listPlaylists`, `getChildContentQueue`, `decideApproval` are called directly, not
  reimplemented), just addressed by `:parentAccountId` from the URL instead of the caller's own
  session. Every one of these re-verifies that the child/playlist/item named actually belongs
  to that one `parentAccountId` — an admin has broad reach across accounts by design, but each
  call is still scoped to exactly the one account named in the request; a mismatched id 404s.

## Curated playlist marketplace

A `CuratedPlaylist` belongs to no parent account — it's built by an admin
(`POST /api/admin/curated-playlists`), the same way a parent builds their own: import a whole
playlist by URL or add one video/website at a time, through the exact same `ContentProvider`
registry every other content path in this app uses (never scraped). It sits as a draft
(`published: false`) until an admin flips `PATCH /api/admin/curated-playlists/:id/publish`.

A curated playlist's own content never enters anyone's per-child approval queue on its own —
that only happens the moment a parent actually adds it.

Parents browse published ones at `GET /api/parents/marketplace` (`/marketplace` in the
dashboard nav) and add one with `POST /api/parents/marketplace/:curatedPlaylistId/add`, which:

1. Clones it into the parent's own `Playlist` (upserted by
   `(ownerParentAccountId, sourceCuratedPlaylistId)` — re-adding the same one updates the
   existing clone rather than duplicating it).
2. For each item, calls `recordContentSubmission` + `ensureContentScored` exactly as a normal
   playlist import would — this is the moment the content enters that parent's own
   review/approval world, so the existing `/playlists` page's per-child approve/reject UI works
   on a marketplace addition completely unchanged, with no special-casing anywhere downstream.

`Playlist.sourceCuratedPlaylistId` is nullable with `onDelete: SetNull` — deleting the curated
source later never deletes a parent's own already-cloned copy, it just detaches it.

Both the curated-playlist import path and the marketplace clone path upsert their join rows
(`CuratedPlaylistItem`/`PlaylistItem`) rather than creating them, for the same reason
`playlist-service.ts`'s `importPlaylist` does: a source playlist can list the same video twice,
and creating a second row for an already-upserted `(playlistId, contentId)` pair hits the
database's own uniqueness constraint instead of just updating its position.

## What's real vs. what needs the operator's own Stripe account

Everything above is built and tested against the real `createParentCheckoutSession`/
`ContentProvider` registry logic this app already uses elsewhere (mocking only the
Stripe-SDK-touching boundary in tests, the same discipline `billing.test.ts` established).
What genuinely cannot be verified without a live Stripe account and a live YouTube API key: an
actual subscriber completing a sent payment link, and a curated playlist actually importing
real YouTube videos — both paths fail *honestly* (503) without those credentials configured,
never with fabricated data.

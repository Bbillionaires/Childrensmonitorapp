# Children's Monitor App

A cross-platform **parental content-control platform** built on a simple, uncompromising rule:

> **If the parent did not approve it, the child does not see it.**

Unlike traditional parental controls (open internet → block bad content), this product starts
with an **empty environment** for the child. Content becomes visible to a child only after a
parent explicitly approves it, or it matches an automated rule the parent has configured.

This is a monorepo containing the API, web app (parent dashboard + child experience), and
shared packages for database access, authentication, content-provider adapters, and the
proprietary **Supervision Score** safety-rating engine.

## Documentation

| Doc | Purpose |
|---|---|
| [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) | Full product spec, user types, milestones |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, monorepo layout, service boundaries |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Normalized schema for every domain entity |
| [SUPERVISION_SCORE.md](./SUPERVISION_SCORE.md) | The safety-rating framework and its versioning |
| [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md) | COPPA posture, RBAC, encryption, data minimization |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Stack rationale, costs, milestone-by-milestone plan |

## Repository layout

```
/apps
  /web            Next.js app: parent dashboard + child experience (web/PWA, mobile-responsive)
  /mobile         React Native (Expo) scaffold (Milestone 8) — UI-only stubs, not wired to
                    the API; see apps/mobile/README.md for what's real vs. stubbed
  /tv-future      Placeholder for smart-TV clients (Milestone 9)

/packages
  /types                Shared TypeScript types & zod schemas (API contracts)
  /database             Prisma schema + generated client, the single source of DB truth
  /auth                 Password hashing, JWT session issuing/verification, RBAC helpers
  /content-providers    ContentProvider adapter interface + provider implementations
  /supervision-score    Supervision Score engine interfaces + MVP rule-based scorer
  /ai                   AI discovery: natural language → structured search params
  /config               Shared eslint/tsconfig/env-schema config

/services
  /api            Fastify REST API — the only process that talks to the database directly
```

## Stack (see IMPLEMENTATION_PLAN.md for rationale)

- **Language**: TypeScript everywhere
- **API**: Fastify + Prisma + PostgreSQL
- **Web**: Next.js (App Router) + Tailwind CSS
- **Auth**: Argon2 password hashing, JWT access/refresh tokens, parent PIN + MFA-ready, separate
  low-privilege child session tokens
- **Monorepo tooling**: pnpm workspaces + Turborepo

## Getting started (local development)

```bash
corepack enable
pnpm install

cp .env.example .env
# Fill in DATABASE_URL at minimum (see .env.example for how to get one)

docker compose up -d          # local Postgres
pnpm --filter @app/database db:migrate
pnpm --filter @app/database db:seed   # optional demo data

pnpm dev                      # runs API (services/api) + web (apps/web) together
```

API runs on `http://localhost:4000`, web app on `http://localhost:3000`.

## Required external credentials

None are required to run Milestone 1 (auth + parent dashboard + child profiles) beyond a
Postgres database. Milestones 2+ require additional API keys; each is called out explicitly
in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) at the point it becomes necessary,
including what the credential is for, where to obtain it, and which environment variable to set.

## Status

Milestones 1–7 are implemented, and Milestone 8 is split (see below): monorepo scaffold, full domain database schema, parent
authentication, parent dashboard, child profile management, URL and playlist import (a real
YouTube adapter plus a website-whitelist fallback — no scraping anywhere), the parent
approval pipeline (bulk select/approve/reject), the child-facing experience (device-handoff
sessions, a closed library, controlled playback), AI-assisted discovery (a natural-language
brief → a structured query → a real YouTube search → candidates a parent reviews and approves
— never auto-visible to a child), the Supervision Score engine (a transparent, rule-based
0–1000 safety rating computed automatically for every piece of content, with a full
category-by-category "Why this score?" breakdown), and viewing history, safety alerts, and
parent reporting (a real per-device activity timeline, Supervision Score re-checks that notify
a parent — Keep Approved, Remove, or Review Details — when approved content's safety
information genuinely changes, and a "Report this content" action on every piece of content).
Discovery runs on a dual-provider setup: OpenAI as the cost-efficient primary translator (this
feature is funded by one shared, operator-paid key, not bring-your-own-key, so cost per call
matters), with Claude as a fallback for calls OpenAI's provider fails on. The Supervision Score
engine now also draws on thumbnail image analysis (same dual-provider setup), official
YouTube channel signals, external-link detection, and — as the one deliberate exception to this
project's "official APIs only" rule — a transcript fetched from YouTube's public watch page,
isolated so its failure (verified live against a real YouTube rate limit) never blocks scoring.
Audio transcription and frame sampling/OCR remain unbuilt: both would require downloading the
video itself, which this project does not do without either per-video creator consent or a
licensed vendor. YouTube search, both AI providers, the Supervision Score engine (including its
Milestone 7 signals), and the Milestone 6 features are all verified end-to-end against live
APIs. Milestone 8 is split: the web app itself is now genuinely mobile-first — a responsive
dashboard nav, an installable PWA (manifest + real icons, deliberately no service worker, to
protect the "approval revocation takes effect immediately" invariant), and a touch-friendly
child player — and this was verified live with Playwright at phone and tablet viewport sizes
against a real seeded backend, not just by typechecking. A native iOS/Android app
(`apps/mobile`) is scaffolded with real, current Expo/React Native versions and UI-only stub
screens, but is explicitly **unverified**: this environment has no simulator or device to
actually run it on — see [apps/mobile/README.md](./apps/mobile/README.md) for exactly what's
real, what's stubbed, and the native-auth design decision that was deliberately left open
rather than made silently. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for what's
next.

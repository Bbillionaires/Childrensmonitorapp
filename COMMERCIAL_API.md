# Commercial Supervision Score API (Milestone 10)

A B2B product, completely separate from the parent/child-facing app: other businesses
(parental-control products, schools/EdTech content filters, smart-TV platforms, kids'-device
makers) license access to this project's content-safety scoring engine for their own products.
A business signing up never touches the parent/child app at all — no login, no session cookie,
just an API key hit from their own backend.

## Signing up

1. `POST /api/v1/clients` with `{ "name": "...", "contactEmail": "..." }` — public, no
   authentication (a business has no key yet; that's what this issues). Returns
   `{ "apiClientId": "...", "checkoutUrl": "..." }`.
2. Redirect to `checkoutUrl` — a Stripe Checkout session for the commercial-API price tier
   (`STRIPE_API_CLIENT_PRICE_ID`, configured in the operator's own Stripe Dashboard; this
   codebase never hardcodes a dollar amount, and this tier is expected to be priced higher than
   the parent-app subscription).
3. Once payment succeeds, a webhook (`POST /api/billing/webhook`, Stripe-signature-verified)
   activates the subscription and issues an API key, which is **emailed once** to
   `contactEmail` — the same "shown once, never again" discipline as every other secret in this
   app. It is never returned by any API response or displayed in any web page; only its hash is
   ever stored (`ApiKey.keyHash`, SHA-256 — see `packages/auth/src/api-keys.ts`).
4. `GET /api/v1/clients/:apiClientId/key-status` → `{ "status": "...", "hasKey": boolean }` —
   lets the web app's post-checkout page (`/api-access/success`) show "activating…" vs. "check
   your email," without ever exposing the key itself.

## Calling the API

```
POST /api/v1/analyze
Authorization: Bearer fsk_live_...
Content-Type: application/json

{ "contentUrl": "https://www.youtube.com/watch?v=...", "contentType": "video", "targetAge": 8 }
```

```json
{
  "contentIdentifier": "cl8f...",
  "supervisionScore": 934,
  "categoryScores": { "grooming_indicators": 950, "advertising_manipulation": 820, "...": "..." },
  "confidence": 0.82,
  "riskFlags": ["advertising_manipulation"],
  "explanation": "...",
  "analysisVersion": "rule-based-v1"
}
```

- `contentUrl` (required) is resolved through the same `ContentProvider` registry (official
  APIs only — see ARCHITECTURE.md) every internal caller uses, deduplicated globally by
  `(providerId, providerRefId)` exactly like a parent's own content submissions. A video already
  scored for some parent in this app is served from that same cached score for a commercial
  caller too, and vice versa — one score per piece of content, not one per caller.
- `contentType` and `targetAge` are accepted for forward compatibility with the contract
  originally sketched in SUPERVISION_SCORE.md, but **`targetAge` does not currently change the
  computed score** — this engine has no age-adjusted scoring model; it scores content
  intrinsically, 0-1000, the same way it does internally.
- `riskFlags` is every category that scored below 500 (a parent would consider it concerning),
  as a flat list of category ids — a simplified public-facing view of the full
  `categoryScores`/`explanation` breakdown this app's own parents see on the Supervision Scores
  page.
- Responses: `401` (missing/invalid/revoked key), `402` (valid key, but no active subscription
  — see below), `422` (URL not recognizable/fetchable), `429` (rate limit exceeded), `503`
  (billing/a content provider isn't configured in this environment).

## Authentication, rate limiting, and billing

- **Authentication**: `Authorization: Bearer <key>`. Only a SHA-256 hash of the key is ever
  looked up or stored — a leaked database dump alone can never be replayed as a live key (same
  reasoning as this app's own refresh/password-reset tokens).
- **Entitlement**: a valid key whose client's subscription has lapsed (`PAST_DUE`/`CANCELED`/
  `UNPAID`) is rejected with `402`, not `401` — the key itself is genuine, the client just isn't
  currently paid up. The key is never revoked just because a subscription lapses; it starts
  working again the moment the subscription does.
- **Rate limiting**: 100 calls/hour per API key (`services/api/src/routes/v1-analyze.ts`),
  independent of any other client's usage — proven in `services/api/src/test/billing.test.ts`
  by exhausting one client's limit and confirming a second client's very next call still
  succeeds.
- **Usage logging**: every call writes an `ApiUsageLog` row (`apiClientId`, `apiKeyId`,
  `endpoint`, `contentId`, `createdAt`) — the basis for any future usage-based billing or
  reporting, though billing itself is currently flat-rate subscription, not metered.
- **Billing**: Stripe subscriptions, webhook-driven (`services/api/src/routes/billing.ts` +
  `services/api/src/services/billing-service.ts`). Requires the operator to configure
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_API_CLIENT_PRICE_ID` (see
  `.env.example`) — without them, `/api/v1/clients` fails honestly with `503` rather than
  fabricating a checkout session.

## What's real vs. what needs the operator's own Stripe account

Built and tested (unit tests with a mocked Stripe client, plus a live walkthrough against a
real seeded database confirming the paywall/signup pages fail honestly with no Stripe keys
configured, and that a subscription row written the way a webhook would write it genuinely
unlocks both the parent dashboard and `/api/v1/analyze`):

- API-key issuance, hashing, and auth (`packages/auth/src/api-keys.ts`,
  `services/api/src/plugins/api-key-auth.ts`)
- The full `/api/v1/clients` → Stripe Checkout → webhook → key-issued-by-email flow
- `POST /api/v1/analyze`'s business logic, response shape, and per-key rate limiting
- The parent-app paywall (`requireActiveSubscription`, gating everything under `/api/parents/*`
  except `GET /me`) and its web UI (`/subscribe`)

**Not verifiable without a real Stripe account**: an actual Checkout redirect and a real
webhook delivery from Stripe's servers. The integration is built to Stripe's documented
contract (Checkout Sessions in `subscription` mode, `customer.subscription.*` webhook events,
signature verification via `stripe.webhooks.constructEvent`), but this environment has no
Stripe account to test an end-to-end real payment against. Supplying `STRIPE_SECRET_KEY` /
`STRIPE_WEBHOOK_SECRET` / `STRIPE_PARENT_PRICE_ID` / `STRIPE_API_CLIENT_PRICE_ID` (test-mode
keys are free and sufficient) is what's needed to verify that last mile live — the same
"you need to supply this credential" pattern as `YOUTUBE_API_KEY`/`OPENAI_API_KEY` in earlier
milestones.

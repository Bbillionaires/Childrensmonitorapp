# Supervision Score

## What it is

A proprietary, independent 0–1000 safety rating computed per piece of content, optionally
contextualized to a child's age range. Higher = lower assessed risk. It is **our** framework:
a platform's own "made for kids" designation, when available, is ingested as one input
signal alongside others — never adopted as the score itself, and never the sole factor in
whether a category is scored well or poorly.

It is never presented to a parent as a guarantee. Every score carries a confidence level and
a plain-language explanation, and the UI language always frames it as a risk assessment,
not a certification.

## Score categories

Each category is scored 0–100 (higher = safer) and rolled up into the 0–1000 overall score
via a documented, versioned weighting (`SafetyCategory.weight`). Categories:

Violence · Sexual Content · Nudity · Potential Grooming/Predatory Indicators · Fear ·
Disturbing Imagery · Jump Scares · Profanity/Language · Drugs · Alcohol · Weapons · Self-Harm ·
Dangerous Challenges · Bullying · Adult Themes · Advertising Manipulation · Gambling ·
External-Link Risk · Hate/Extremist Content · Age Appropriateness.

**On grooming/predatory indicators specifically**: the system never claims to determine
whether a person is a predator. It surfaces pattern-based signals (e.g. a video/description/
comments-off-platform-signal pattern historically correlated with grooming behavior) as
"Potential grooming/predatory indicators detected", always with a confidence level and the
specific factors that triggered it, and always requiring parent judgment before any action
is taken. This category, like every other, contributes to the score — it is never the basis
for an automated, unreviewable takedown.

## Display

```
SUPERVISION SCORE
934 / 1000
LOW RISK

Violence: 98/100
Sexual Content: 100/100
Fear/Disturbing Content: 82/100
Language: 97/100
Dangerous Behavior: 100/100
Advertising Manipulation: 76/100
Potential Grooming Indicators: 96/100

[Why this score?]
```

Expanding "Why this score?" shows, per category: the detected factors, the confidence level,
and (once available) links to the underlying signal (metadata field, transcript excerpt,
etc.). Risk bands (illustrative, tunable): LOW RISK ≥ 900, MODERATE 700–899, ELEVATED
500–699, HIGH < 500 — configurable per child via
`Child.supervisionScoreMinimum` / `categoryThresholdOverrides`.

## Engine architecture

```ts
interface ScoringInput {
  content: ContentRecord;
  providerMadeForKids: boolean | null;   // one signal, not the verdict
  transcript?: string;                    // Milestone 7
  frameSamples?: FrameSample[];            // Milestone 7
  ocrText?: string[];                      // Milestone 7
  externalLinksFound?: string[];           // Milestone 7
  creatorSignals?: CreatorSignal;          // Milestone 7
  parentReports?: ParentReportSummary[];   // Milestone 6+
}

interface CategoryScore {
  categoryId: SafetyCategoryId;
  score: number;       // 0-100
  confidence: number;  // 0-1
  detectedFactors: string[];
}

interface SupervisionScoreResult {
  modelVersion: string;
  overallScore: number;      // 0-1000
  confidence: number;
  categories: CategoryScore[];
  explanation: string;
  signalsUsed: (keyof ScoringInput)[];
}

interface SupervisionScorer {
  readonly modelVersion: string;
  score(input: ScoringInput): Promise<SupervisionScoreResult>;
}
```

### Milestone 5 implementation (rule-based, metadata-only)

`packages/supervision-score`'s first real scorer (`modelVersion: "rule-based-v1"`) uses only
signals available without additional cost: provider metadata (title/description keyword
matching against category-specific term lists), `providerMadeForKids`, duration, and
category/topic tags. Every category starts from a neutral baseline and is only marked down
when a specific signal is found — it never claims certainty it doesn't have, and every
category result carries a confidence below 1.0 unless corroborated by a strong explicit
signal (e.g. the provider's own age restriction flag).

### Milestone 7: deeper analysis — what's real, what's still a gap

Of PRODUCT_REQUIREMENTS.md's "transcript/audio/frame/OCR," only transcript analysis is built,
and via a documented exception rather than an official API (see IMPLEMENTATION_PLAN.md and
ARCHITECTURE.md's "Deeper content analysis" section for exactly what it does and why it must
never throw). Audio transcription and frame sampling/OCR have no non-scraping path — both would
require downloading the video itself — so they remain unbuilt pending either per-video OAuth
consent from each video's own channel owner or a licensed vendor, not an engineering gap.

What Milestone 7 does add, each an independent, best-effort `ScoringInput` producer that
degrades to simply absent (never fabricated) on its own failure:

- **Thumbnail image analysis** — an AI vision call (OpenAI primary, Claude fallback, same
  dual-provider shape as AI discovery) against the provider's own public thumbnail URL.
- **Transcript analysis** — the one deliberate exception above; feeds the same keyword-matching
  path as title/description.
- **External-link analysis** — a regex over the already-fetched description text.
- **Creator/channel history signals** — the official `channels.list` endpoint; only ever
  corroborates (raises confidence on) an already-triggered `grooming_indicators` match for a
  new/low-history channel, never an independent penalty for being new.

Not yet built: **OCR of on-screen text** and **validated parent reports feeding
recalculation** (Milestone 6 built report *submission*; there is no moderation/validation
workflow yet to act on a validated one) and **historical moderation signals from the
provider**. Each remaining item becomes an additional producer of `ScoringInput` fields
whenever it's built; the scorer interface and the storage model do not change when a new input
is added, only `signalsUsed` grows.

## Versioning (non-negotiable)

- A score is never overwritten in place. `ScoreVersion` rows are append-only;
  `SupervisionScore.currentScoreVersionId` is repointed, and the prior version stays queryable
  via `ScoreVersion.previousScoreVersionId`.
- Every `ScoreVersion` stores: score, model version, analysis date, signals used, full
  category breakdown, confidence, explanation, and a pointer to the previous version.
- Re-scoring under a new model version (or new signals becoming available) always creates a
  new `ScoreVersion` and, if the score moved meaningfully or crossed a child's threshold,
  raises a `SafetyAlert` rather than silently changing what a child can see.

## Parent thresholds

- `Child.supervisionScoreMinimum`: overall floor (e.g. 950 for one child, 875 for another).
- `Child.categoryThresholdOverrides`: per-category strict/moderate/relaxed override that can
  raise (never silently lower below a safety floor the parent hasn't explicitly set) the
  bar for a specific category, e.g. Violence: Strict, Fear: Moderate, Language: Strict,
  Advertising: Moderate.
- The parent's explicit approval always overrides the automated score where legally and
  technically appropriate — a `ParentApproval` row is a final decision; the score informs,
  it does not gate, a parent's own explicit choice.

## Commercial Supervision Score API (Milestone 10)

Built for real, exactly as sketched above:

```
POST /api/v1/analyze
Authorization: Bearer fsk_live_...
{ "contentUrl": "...", "contentType": "video", "targetAge": 8 }

→ {
  "contentIdentifier": "...",
  "supervisionScore": 934,
  "categoryScores": { "grooming_indicators": 950, ... },
  "confidence": 0.82,
  "riskFlags": ["advertising_manipulation"],
  "explanation": "...",
  "analysisVersion": "rule-based-v1"
}
```

Authenticated by a per-business API key, rate-limited per key, and gated on an active (paid)
subscription — see [COMMERCIAL_API.md](./COMMERCIAL_API.md) for the full contract, how
businesses sign up, and exactly what's real vs. what still needs the operator's own Stripe
account configured. `targetAge` is accepted for request-shape compatibility with the original
sketch above but does not currently change the computed score: this engine scores content
intrinsically (0-1000), the same way it does for this app's own parents — there is no
age-adjusted scoring model yet. Namespaced `/api/v1/` since before this milestone, specifically
so it could be split into its own service later without a breaking path change — unchanged by
actually building it.

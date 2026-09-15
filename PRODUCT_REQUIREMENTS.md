# Product Requirements

## Core philosophy

Traditional parental controls: **open internet → block bad content** (blocklist model, always
leaky, always reactive).

This product: **empty environment → parent approves content → child receives an approved
library** (allowlist model). Every product decision is evaluated against this rule. When a
proposed feature would let a child reach content the parent did not approve or explicitly
opt into via a rule, the feature is wrong as specified.

## User types

### Parent / Admin
- Email/password authentication with secure hashing (Argon2id)
- Password reset via emailed, single-use, expiring token
- Optional TOTP-based MFA (architected in Milestone 1, enabled in a later milestone)
- Parent PIN (short numeric code) for quick re-authentication when switching between the
  parent dashboard and a child's device session
- Biometric authentication on platforms that support it (native mobile/TV — architecture
  supports it via a device-attested session exchange; not implemented until Milestone 8/9)
- Can manage multiple child profiles, each with independent settings

### Child
- No access to any parental/administrative setting, ever, at the API authorization layer —
  not just hidden in the UI
- Sees only an approved library, curated per-profile

## Child profile

Each child profile has:
- First name / nickname, avatar, age or age range
- Interests and parent-selected content categories
- Safety settings, including a Supervision Score minimum threshold (overridable per category)
- Approved playlists, approved videos, approved websites
- Viewing history
- Daily viewing limits and an allowed viewing schedule (time-of-day/day-of-week windows)

## Closed content environment

The child interface never provides:
- Unrestricted internet access or unrestricted video search
- Algorithmic autoplay outside an approved playlist
- Unapproved search results, suggested searches, comments, or external links
- Shorts/reels feeds or creator/community posts, unless individually approved
- Any path — deep link, redirect, or otherwise — to unapproved content

Everything the child can reach is enumerated in `ChildContentPermissions`, computed from
explicit parent approvals (auto-approval rules are a later milestone, but the permission
model is architected to support them from day one — see DATABASE_SCHEMA.md).

## Parent content submission

Parents paste a video, playlist, or website URL. The system:
1. Identifies the provider from the URL
2. Validates the URL
3. Retrieves metadata via the provider's official API (title, thumbnail, description,
   duration, channel/creator, available age/kids metadata)
4. Stores a provider reference (ID/URL), never a re-hosted copy of the copyrighted media
5. Presents the content to the parent for approval before any child can see it

Playlist import lists every item with individual checkboxes plus **Select All / Deselect
All / Approve Selected / Reject Selected** actions — parents can review each video before
it reaches a child's library.

New content sources are added by implementing the `ContentProvider` adapter interface
(see ARCHITECTURE.md); no scraping is used where an official API exists or is required by
the provider's terms.

## AI-assisted discovery

A parent can type a natural-language brief (e.g. "educational videos for my 8-year-old
about planets, gravity, rockets and the solar system, under 20 minutes, avoid scary
imagery"). The system converts this into structured search parameters (age range, topics,
max duration, excluded themes) and returns candidates, each annotated with why it matched.
Results are suggestions only — nothing becomes visible to a child until the parent approves
it (or, in a future milestone, unless the parent has explicitly enabled auto-approval for
matching content).

## Supervision Score

A proprietary 0–1000 safety rating, independent of any platform's own "made for kids" flag
(which may be used as one input signal among many, never as the sole determinant). Modeled
across category scores (violence, sexual content, fear/disturbing imagery, language, drugs/
alcohol, dangerous behavior, grooming indicators, advertising manipulation, and more — see
SUPERVISION_SCORE.md for the full list). Every score is versioned; nothing is silently
overwritten. Parents can expand "Why this score?" for a category-by-category explanation and
confidence levels. The score is never presented as a guarantee.

## Parent dashboard

Children · Approved Content · Pending Reviews · Playlists · Discover Content · Websites ·
Viewing Activity · Supervision Scores · Safety Alerts · Screen-Time Settings · Account
Settings.

## Viewing history

Per view: content, child, date, start time, duration watched, completion percentage,
device, and playlist/source — presented as a readable activity timeline.

## Safety alerts

When previously approved content receives new safety information, the parent is notified
and chooses: **Keep Approved**, **Remove**, or **Review Details**. Content is never silently
removed except where legally required or the content becomes technically unavailable.

## Parent reporting

Parents can report content for: inappropriate content, violence, sexual content, disturbing
imagery, grooming indicators, dangerous challenges, misleading age classification,
advertising, or other. Validated reports become signals feeding future Supervision Score
recalculation.

## Search and discovery (parent-facing)

By subject, child age, duration, creator, educational category, Supervision Score, risk
category, or source — e.g. "math videos for a 7-year-old under 15 minutes with Supervision
Score above 925."

## Privacy (COPPA-aligned)

Minimum necessary child data. No exact location, no unnecessary identifiers, no unnecessary
voice/image capture, no advertising identifiers from children, and children's personal
information is never sold. See SECURITY_AND_PRIVACY.md.

## Advertising

No behavioral advertising targeted at children. If sponsorship/advertising is ever
introduced, parent and child experiences must remain strictly separated, subject to legal
review before activation.

## Milestones

1. Architecture, database, authentication, parent dashboard, child profiles — **this repo's
   current state**
2. URL submission, content-provider architecture, video metadata, parent approval system
3. Playlist import, bulk selection, child library, controlled playback
4. AI parent search/discovery
5. Basic Supervision Score engine
6. Viewing history, safety alerts, parent reporting
7. Advanced AI analysis (transcript/audio/frame/OCR)
8. Mobile optimization / native applications
9. TV applications
10. Commercial Supervision Score API

## Non-negotiable invariants (tested)

- A child cannot access another child's content or account
- A child cannot access any parental setting, at the API layer, not just the UI
- An unapproved URL cannot be opened through the child experience
- A video never autoplays into unapproved content
- A playlist cannot expose an unapproved video
- Parent approval/removal changes propagate immediately
- Supervision Scores retain full version history
- Provider/API credentials never reach client code

# @app/supervision-score

**Status: interface only.** Defines the `SupervisionScorer` contract and the category list
from SUPERVISION_SCORE.md. The rule-based MVP scorer (`modelVersion: "rule-based-v1"`)
ships in **Milestone 5**, scoring only from metadata signals available at import time.
Frame/transcript/audio-based scoring is a **Milestone 7** addition behind the same
interface — see SUPERVISION_SCORE.md for the full roadmap.

Every score computed by a future implementation must be persisted as a new `ScoreVersion`
row (never an in-place update) — see DATABASE_SCHEMA.md and SUPERVISION_SCORE.md's
versioning rules.

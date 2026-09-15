# @app/ai

**Status: interface only.** Defines `DiscoveryTranslator`, which turns a parent's
natural-language brief into a structured `DiscoveryQuery`. The real implementation
(Milestone 4) calls the Claude API and requires `ANTHROPIC_API_KEY` — see
IMPLEMENTATION_PLAN.md. Results from a `DiscoveryTranslator` are always suggestions to a
parent; nothing this package produces becomes visible to a child without an explicit
`ParentApproval` (or a future auto-approval rule the parent configured) — see
PRODUCT_REQUIREMENTS.md's "AI-assisted discovery" section.

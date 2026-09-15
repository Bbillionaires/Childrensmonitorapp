# @app/content-providers

**Status: interface only.** This package defines the `ContentProvider` adapter contract
described in ARCHITECTURE.md. Real adapters (YouTube via the official YouTube Data API v3,
a website allowlist "adapter", later Vimeo/others) are implemented in **Milestone 2**, and
require `YOUTUBE_API_KEY` — see IMPLEMENTATION_PLAN.md for where to obtain it.

Do not call any external API from this package without an adapter file that owns exactly
one provider and never scrapes where an official API exists or is required by that
provider's terms of service.

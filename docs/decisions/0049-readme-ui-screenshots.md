# 0049 - README UI Screenshots

## Status

Accepted

## Context

Bloom is becoming a product-style UI framework, so new contributors should see the current visual direction before
digging into code. Manual screenshots are easy to forget and can drift from the actual app.

## Decision

Bloom uses a small Playwright-based capture script for README screenshots:

- `npm run capture:readme` captures the landing page, builder home, and app configuration page.
- Screenshots are stored in `docs/assets/screenshots`.
- The script expects the local dashboard and backend to be running during capture.
- Playwright is kept as a root dev dependency for visual smoke tooling.
- The README keeps a concise product front door with badges, quick links, value props, and the generated screenshots.

## Consequences

- The README can show real current UI instead of mockups.
- Future visual smoke tests can grow from the same tooling.
- Screenshots should be refreshed when UI foundation changes affect the visible product flow.
- Repository presentation should stay useful and maintained, not become decorative noise.

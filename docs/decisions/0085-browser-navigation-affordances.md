# 0085 - Browser Navigation Affordances

Date: 2026-06-04

Status: accepted

## Context

Bloom originally used internal React state for product navigation. That made primary buttons work, but standard browser
affordances such as Back and Forward could move the browser history without restoring the expected Bloom view. For users,
that can look like a blank or broken page.

Bloom is a web app, so standard browser controls should remain trustworthy. This is especially important for handover:
people should not need to learn hidden rules such as "never use the browser back button".

## Decision

Bloom product-level navigation is encoded in stable hash routes:

- `#/`
- `#/builder`
- `#/builder/app`
- `#/builder/screen`
- `#/runtime`
- `#/runtime/app`
- `#/help`

The route is intentionally small. It captures the main affordance state without introducing a full routing framework
before the app needs one.

## Quality Gate

The dashboard test suite covers route parsing and browser history restoration.

The visual smoke script also verifies Back and Forward in Chromium at the supported visual checkpoints. This keeps
navigation affordances tied to the same responsive QA as landing, builder, and runtime.

## Consequences

- Direct links to product zones are possible.
- Browser Back and Forward restore Bloom views instead of desynchronizing UI state.
- Future deeper links can extend this route model with selected app, screen, or debug context when needed.

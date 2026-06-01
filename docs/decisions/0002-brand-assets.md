# 0002: Store Dashboard Brand Assets In Public

Date: 2026-06-01

## Decision

Store web-ready Bloom dashboard brand assets in `frontend/apps/bloom-dashboard/public`.

Current assets:

- `logo.png`
- `favicon.png`

## Context

The dashboard is a Vite app, and files in `public` are served directly from the app root. This makes assets easy to reference from `index.html` and React components.

## Consequences

- Runtime references can use root-relative paths such as `/favicon.png` and `/logo.png`.
- Source or editable brand files can be added later under `docs/brand` if needed.
- The public folder should contain web-ready exports, not large working design files.

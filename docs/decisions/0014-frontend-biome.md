# 0014. Frontend Biome Checks

## Status

Accepted

## Context

Bloom is about to migrate more TypeScript and React code from the legacy Extender UI. Without automated formatting and linting, small style differences would quickly make review noisy and hide architectural changes.

## Decision

Use Biome at the monorepo root for frontend formatting, import organization, and lint checks.

The root commands are:

- `npm run check` for CI-safe validation.
- `npm run format` for local automatic fixes.

CI runs `npm run check` before frontend build and tests.

## Consequences

Future frontend migrations should keep Biome green in the same PR that introduces code. We can still add more specialized tools later if React-specific needs outgrow Biome, but this gives Bloom a simple default first.

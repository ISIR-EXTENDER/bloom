# 0011. Frontend Dashboard Foundation

## Status

Accepted

## Context

Before connecting the dashboard to configuration APIs, Bloom needs a small but intentional React foundation. The previous dashboard entry point only proved that React mounted; it did not give us a useful shell for migrated widgets or user-visible tests.

## Decision

Create a focused dashboard shell with:

- Content data separated from the `App` rendering component.
- A project-specific visual baseline using local CSS.
- React Testing Library with `jsdom` so tests assert visible behavior.
- No router, global state library, or design-system abstraction until a concrete migrated screen needs them.

## Consequences

The configuration API client can now be integrated into a stable frontend shape instead of becoming the first structural decision. Future frontend migrations should keep the same pattern: introduce one visible capability, add behavior-focused tests, then extract reusable libraries only when duplication appears.

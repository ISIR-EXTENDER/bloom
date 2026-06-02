# 0023. Product Navigation Boundaries

## Status

Accepted.

## Context

The current dashboard page includes landing content and a development screen preview. This is useful while proving the
configuration and widget foundations, but it should not become the final product structure.

## Decision

Keep Bloom's product navigation separated:

- landing page for introduction and entry point;
- main app shell for choosing builder or runtime mode;
- app builder for screens, widgets, layout, settings, and persistence;
- runtime apps for operating configured interfaces.

The landing page should have a clear button into the main app. The main app should then let users choose between the app
builder and available runtime apps.

## Consequences

The temporary screen preview can remain during foundation work, but it should move into the main app/builder area once
routing exists. This prevents the landing page from becoming a mixed marketing, builder, and runtime surface.

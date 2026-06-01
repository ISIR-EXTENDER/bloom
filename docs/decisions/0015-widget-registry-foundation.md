# 0015. Widget Registry Foundation

## Status

Accepted

## Context

Bloom needs to migrate widgets from the legacy Extender UI, but starting with visual components would prematurely lock design decisions. The first step should define the domain contract: what a widget definition is, how it is registered, and how missing widget implementations are represented safely.

## Decision

Create `frontend/libs/widgets` as a framework-independent TypeScript package.

The first slice includes:

- `WidgetDefinition` for registered widget capabilities.
- `WidgetRegistry` for mapping configuration widget kinds to definitions.
- descriptor builders for individual widgets and screens.
- explicit unknown-widget descriptors instead of throwing during rendering.
- fixture-backed tests using the shared configuration contract.

## Consequences

Widget migration can now proceed one capability at a time. Visual React components and Bloom-specific styling remain separate follow-up work, driven by actual migrated widget needs rather than speculative design.

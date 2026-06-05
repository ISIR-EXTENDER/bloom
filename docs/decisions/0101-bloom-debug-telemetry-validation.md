# 0101 - Bloom Debug Telemetry Validation

Date: 2026-06-05

## Context

Phase 4 needs Bloom Debug to be useful enough for migrated robot apps before we keep adding more widgets. Earlier topic
plot widgets showed only the latest numeric value. That was safe, but not enough for operators and developers who need
to see whether a velocity, torque, or state signal is stable, drifting, or noisy.

## Decision

Keep the first telemetry visualization first-party for now:

- `topic-plot` reuses the same lightweight SVG rendering helpers as the generic `plot` widget.
- `topic-plot` supports `area`, `sparkline`, and `bars` variants.
- The widget keeps the latest value prominent and adds a small min/max range.
- Seeded migrated apps are covered by a runtime smoke test so useful apps do not regress to blank or "coming soon"
  screens.

We will not introduce a richer chart dependency yet. A heavier dependency can be evaluated later if first-party plots
cannot cover multi-series telemetry, zooming, cursor inspection, or longer offline traces.

## Consequences

- Bloom Debug becomes more useful while staying small and maintainable.
- Generic display plots and live topic plots now share one rendering primitive instead of drifting.
- Phase 4 can close with a stronger migration validation signal across Petanque, Sandbox, Bloom Debug, Explorer, and
  Webcam demo apps.

# 0093 - Lightweight Plot Variants

## Status

Accepted.

## Context

Phase 4 migrates reusable display widgets. Bloom needs telemetry views for
debugging velocities, torques, positions, and simple app state. `extender_ui`
used richer plotting dependencies successfully, but Bloom should not add a heavy
chart dependency until real runtime requirements justify it.

The first `plot` widget was a fixed sparkline-style preview. That was useful but
too narrow for supervision screens and fixtures.

## Decision

Extend the first-party `plot` widget contract with:

- `variant`: `area`, `bars`, or `sparkline`;
- `unit`;
- optional `yMin` and `yMax` bounds.

Render these variants with the existing SVG renderer and Bloom design tokens.

## Consequences

- Bloom can cover more telemetry/demo use cases without a new dependency.
- App fixtures can communicate intent more clearly: trend, bounded gauge-like
  bars, or compact sparkline.
- Richer PlotJuggler-like interactions still remain future work for Bloom Debug
  once real runtime needs are clearer.

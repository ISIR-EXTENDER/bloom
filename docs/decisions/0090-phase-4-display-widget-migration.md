# 0090 - Phase 4 Display Widget Migration

Date: 2026-06-04

## Context

Phase 4 starts the systematic migration of real legacy app screens from `extender_ui` into Bloom. The first risk was not
technical rendering but usefulness: migrated apps should not contain empty screens or placeholder-only widgets that make
Bloom feel unfinished.

The legacy UI used practical widgets for labels, plots, gauges, camera streams, joysticks, sliders, toggles, logs, and
ROS message controls. Bloom already had strong control/runtime contracts, but several display families still rendered as
generic placeholders.

## Decision

Bloom now treats lightweight display widgets as first-class generic foundations:

- `label` renders configured text, alignment, and font size instead of widget metadata.
- `gauge` renders an accessible meter with min/max/value/unit settings.
- `plot` renders a first-party SVG sparkline from preview samples.
- `robot-3d` renders a useful extension placeholder that keeps the future adapter boundary visible without pretending a
  real 3D adapter exists yet.
- Real app configuration fixtures are guarded by tests so shipped app screens must contain at least one useful widget.

We intentionally kept the generic plot first-party for now instead of introducing `recharts` immediately. The legacy
dependency remains a good candidate for richer telemetry, but Phase 4 needs stable migration primitives before adding a
larger visualization dependency.

## Consequences

- Petanque and Sandbox screens can be filled with meaningful generic widgets while app-specific semantics stay in config.
- Builder/runtime previews are more useful because display widgets no longer collapse into placeholder text.
- Future richer display widgets can replace these foundations without changing the screen/widget model.
- Empty screens should stay in draft/playground flows, not in shipped app fixtures.

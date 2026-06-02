# 0027. Interactive Slider Renderer

## Status

Accepted

## Context

Bloom needs reusable widget primitives before migrating complete screens from `extender_ui`.
The legacy interface already used Radix UI for slider behavior, and the widget inventory identified sliders as a generic control primitive shared by teleoperation and supervision apps.

## Decision

Add an interactive slider renderer in `@bloom/widget-renderers` using `@radix-ui/react-slider`.
The renderer reads generic widget settings such as `min`, `max`, `step`, and `direction`, then emits a Bloom runtime action intent when the value changes.

The renderer does not publish ROS messages or call backend APIs directly.
Adapters remain responsible for turning runtime intents into transport-specific side effects.

## Consequences

- Sliders become the first interactive control primitive in the React renderer registry.
- Future interactive widgets should follow the same pattern: read declarative settings, emit action intents, and keep side effects outside the renderer.
- Tests validate keyboard-accessible interaction so regressions are caught without depending on browser layout behavior.

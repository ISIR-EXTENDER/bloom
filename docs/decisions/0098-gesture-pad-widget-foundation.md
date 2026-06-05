# 0098 - Gesture Pad Widget Foundation

Date: 2026-06-05

## Status

Accepted.

## Context

The legacy Petanque interface had a `throw-draw` widget for trajectory-like interaction. The behavior is useful beyond
Petanque: an operator may need to express an angle, a power, or another two-parameter gesture for throws, teaching,
camera targeting, or machine setup.

Bloom should not migrate this as a Petanque-specific widget. Petanque command names and ROS topics belong in app
configuration or adapters, while the interaction primitive belongs in the generic widget foundation.

## Decision

Add a generic `gesture-pad` widget kind.

The widget:

- captures an angle in degrees and a normalized power value;
- emits a generic `value-change` intent with `{ angleDegrees, power }`;
- supports optional command/topic/message metadata for runtime adapters;
- hides technical details by default for operator-facing runtime screens;
- maps legacy `throw-draw` to `gesture-pad` in frontend and backend legacy import paths.

## Consequences

Petanque can now reuse Bloom core for trajectory-like inputs without hard-coding Petanque semantics into the renderer.
Future app-specific adapters can decide how to serialize the gesture toward ROS or another runtime protocol.


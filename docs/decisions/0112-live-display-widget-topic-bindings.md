# 0112 - Live Display Widget Topic Bindings

Date: 2026-06-08

## Status

Accepted.

## Context

Robot-facing Bloom screens need more than command widgets. During sandbox, Petanque, and debug preparation, several
display widgets were still useful only as static previews: `event-log`, `gauge`, generic `plot`, and `robot-3d`.

`topic-echo` and `topic-plot` already had live subscriptions, but those widgets are intentionally debug-flavored. A
normal operator screen also needs clean live values without turning every screen into a ROS console.

## Decision

Generic display widgets can now declare optional runtime topic bindings:

- `gauge`: `topic`, `messageType`, `fieldPath`, `show_details`.
- `plot`: `topic`, `messageType`, `fieldPath`, `maxSamples`, `show_details`.
- `event-log`: `topic`, `messageType`, `fieldPath`, `maxEntries`, `show_details`.
- `robot-3d`: continues to use `jointStateTopic` and receives live joint-state samples as an extension-ready status.

Runtime keeps one subscription path for all topic-backed widgets. Operator widgets render concise live values by
default, while `show_details` exposes source topic context when needed.

## Consequences

- Existing static previews keep working because empty topics mean "static mode".
- Robot screens can use `gauge` for battery/progress/scalar state and `plot` for simple velocities/torques before
  introducing a heavier chart dependency.
- Operator screens can subscribe an `event-log` to `/rosout` or app-specific event topics without exposing raw JSON by
  default.
- `robot-3d` is no longer a silent placeholder during robot tests: it can confirm `/joint_states` is flowing while the
  real 3D adapter remains optional.
- Debug widgets remain available for raw inspection, pause/clear/copy, and richer troubleshooting.

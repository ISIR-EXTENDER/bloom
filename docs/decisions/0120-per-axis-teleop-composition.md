# 0120 - Per-axis teleop composition

Date: 2026-09-01

## Context

Bloom's teleop adapter mapped **one joystick to either linear or angular**,
chosen by `mode_id`. Nothing could contribute `linear.z` or `angular.z`, so a
6-DoF twist could not be assembled from separate controls.

The Sandbox app appeared to have Z and RZ sliders, but they published scalars to
`/cmd/joystick_z` and `/cmd/joystick_rz`, which nothing in the manager stack
subscribes to. In `extender_ui` those fed a store that assembled the full twist;
in Bloom they reached nothing.

## Decision

Adopt the `AxisMap` model from `input_interfaces/joystick_mapper`, which is the
reference input implementation for `cartesian_manager`.

A runtime binding may declare which twist components its outputs drive:

```json
"runtime_binding": {
  "adapter": "teleop",
  "axis_mapping": { "x": { "component": "linear_x" }, "y": { "component": "linear_y" } },
  "axis_deadzone": 0.2,
  "value_mapping": { "target_topic": "/joystick_cartesian_command" }
}
```

A `TeleopTwistComposer` accumulates contributions per widget, and every publish
carries the complete six-component twist.

## Why composition has to happen in Bloom

`InputManager::setCommand` **replaces** the latest command for a source and only
sums *across* sources. If each widget published its own twist to
`/joystick_cartesian_command`, the last one to publish would erase the others: a
Z slider would wipe out the translation joystick.

The manager also drops a source whose command is older than `timeout_sec`
(0.2 s in the Explorer bringup), so the runtime must keep publishing the composed
twist, including zeros, rather than only on change.

## Parity with the physical joystick

A Bloom joystick should produce the same twist as Mégane's for the same
deflection. Three differences had to be reconciled, taken from
`joystick_mapper/bringup/config/joystick_3d.yaml` and
`signal_processing/src/dead_zone.cpp`:

| | `joystick_mapper` | Bloom before |
| --- | --- | --- |
| Dead zone | per-axis, on each `\|value\|` | on the 2D magnitude |
| Above the dead zone | rescaled, `(m - dz) / (1 - dz)` | raw value, unscaled |
| Configured value | 0.2 | 0.1 |

Both differences are felt by an operator. A mostly-X push of `(0.9, 0.1)` gives
`(0.875, 0)` on the physical joystick, because 0.1 sits inside Y's own dead
zone, but gave `(0.9, 0.1)` in Bloom — a small unwanted drift. And crossing the
dead-zone edge stepped from 0 straight to 0.2 instead of ramping from zero.

`applyScaledDeadZone` is therefore ported exactly, and a parity test checks it
against a transcription of the C++ across the full input range, plus the B1 and
B2 axis layouts from her config.

The unit-disk clamp on joystick vectors is kept. It is a property of a circular
touch surface rather than of the mapping, and it stops a corner press commanding
more than a full-deflection one.

## Consequences

- Existing apps are unchanged. Without `axis_mapping` a joystick keeps the
  translation/rotation behaviour, and without `axis_deadzone` no per-axis dead
  zone is applied.
- The Explorer Manager app has working Z and RZ, and uses `axis_deadzone: 0.2`
  to match the Explorer joystick. Its joysticks set the widget's own dead zone to
  0, so the magnitude dead zone does not double-apply.
- The frontend/backend coherence check now recognises teleop widgets and
  validates their target against `allowed_teleop_targets` rather than
  misreading it as a publish topic. That is 62 assertions it was not making.

## Follow-up

`joystick_mapper` swaps its entire axis map on a local B1/B2 button without
publishing a mode request. Bloom has no equivalent yet: an app needs two separate
joysticks where the physical device reuses one. A mode-swapped axis map would
close that gap.

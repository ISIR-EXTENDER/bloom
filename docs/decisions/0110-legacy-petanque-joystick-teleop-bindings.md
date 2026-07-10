# 0110 - Legacy Petanque Joystick Teleop Bindings

## Context

The migrated Petanque screens still carried legacy joystick topics such as
`/cmd/joystick_xy` and `/cmd/joystick_rxry`. Those topics documented the old
`extender_ui` intent, but Bloom runtime vector widgets do not publish arbitrary
vector topics directly. Robot motion in Bloom should go through the mode-aware
teleop runtime adapter and publish `extender_msgs/msg/TeleopCommand` on
`/teleop_cmd`.

## Decision

Keep the legacy topic metadata for traceability, but add explicit
`runtime_binding` entries to the Petanque `default_control` and
`default_live_teleop` joystick widgets:

- translation joysticks use mode `BOTH` (`mode: 3`) and map vector values to
  linear teleop fields;
- rotation joysticks use mode `ROTATION` (`mode: 1`) and map vector values to
  angular teleop fields;
- both bindings target `/teleop_cmd`, publish at `20 Hz`, and send zero on
  release.

## Consequences

- Migrated Petanque runtime screens can exercise the same Bloom ROS teleop path
  as the Sandbox teleop lab.
- Legacy JSON remains understandable for comparison with `extender_ui`.
- Future app-specific mode policy can still choose different mode constants
  without changing the generic joystick renderer.

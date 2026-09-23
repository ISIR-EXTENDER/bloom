# 0110 - Petanque Joystick Teleop Bindings

Rewritten 2026-09-23: the original decision bound these joysticks to the legacy
`/teleop_cmd` path, which nothing in the current stack consumes. The Petanque
rebase moved them, and this record now describes the wiring that exists.

## Context

The Petanque screens carry two joystick pairs (`default_control` and
`default_live_teleop`). Robot motion in Bloom goes through the mode-aware
teleop runtime adapter, and since the cartesian_manager migration the adapter
composes one `geometry_msgs/msg/TwistStamped` per session on
`/joystick_cartesian_command`, which the manager sums with its other sources.

## Decision

Bind the Petanque joysticks and axis sliders through `runtime_binding` entries
on the widgets:

- translation joysticks use mode `BOTH` (`mode: 3`); rotation joysticks use
  mode `ROTATION` (`mode: 1`); both target `/joystick_cartesian_command` and
  send zero on release;
- the Z and RZ sliders contribute `linear_z` and `angular_z` to the same
  composed twist through the teleop adapter's axis mapping, as the Sandbox
  sliders do.

## Consequences

- Petanque exercises the same teleop path as Sandbox and the Manager apps: one
  twist per session, summed by cartesian_manager, normalized downstream.
- No `/cmd/*` or `/teleop_cmd` topic survives in the app; the parity contract
  (`scripts/petanque-parity-contract.mjs`) asserts it.

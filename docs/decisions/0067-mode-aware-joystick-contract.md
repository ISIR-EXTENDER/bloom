# 0067 - Mode-Aware Joystick Contract

Status: accepted.

## Context

Teleoperation quality depends on small interaction details. The legacy
`extender_ui` joystick already proved several useful behaviors: explicit
deadzone, normalized values, semantic labels, continuous publishing while held,
and zero commands on release.

Bloom needs to preserve those behaviors without hard-coding Explorer or ROS
topic names into generic widget components.

## Decision

Extend the generic joystick settings contract with:

- `mode_id`;
- `axis_hints`;
- `deadzone`;
- `publish_rate_hz`;
- `zero_on_release`;
- `runtime_binding`.

The joystick renderer remains a generic tactile input primitive. It displays
mode and axis hints, emits normalized vector intents continuously while held, and
sends zero on release/unmount when configured.

Explorer-specific mode names, topic names, ROS message mappings, and service
bindings must live in application configuration or in an Explorer extension.

## Consequences

- Runtime adapters can map joystick intents to ROS, WebSocket, or non-ROS
  systems without changing the widget renderer.
- Legacy `binding: "joy" | "rot"` settings remain compatible during migration.
- Future app builders can expose presets for robot modes while keeping the
  stored model generic.

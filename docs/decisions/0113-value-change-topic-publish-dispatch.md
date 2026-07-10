# 0113 - Value Change Topic Publish Dispatch

Date: 2026-06-08

## Status

Accepted.

## Context

Bloom input widgets produce `value-change` intents. Joysticks are routed to the teleop adapter, and sliders already had
scalar topic publishing. The generic `gesture-pad` widget, however, emits an angle/power object. That meant a migrated
Petanque gesture screen could look functional while the runtime dispatcher still returned `unsupported`.

## Decision

Runtime value-change dispatch now supports topic publishing for finite numbers and JSON-like object values when a
configured topic and message type are present.

- Numeric values keep the existing scalar payload mapping.
- Object values publish as structured payloads by default.
- `std_msgs/msg/String` receives JSON text in `data`, which keeps generic gesture payloads usable with simple ROS
  subscribers.
- `geometry_msgs/msg/Vector3` can map 2D vector values into `{x, y, z: 0}`.

## Consequences

- `gesture-pad` is now usable as a real ROS command input, not only as a UI preview.
- Petanque throw gesture experiments can stay generic while publishing to `/petanque/throw/gesture`.
- More specialized payload schemas should still live in app configuration or future adapters, not inside widget
  components.

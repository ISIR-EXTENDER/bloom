# 0071 - Runtime Teleop WebSocket Adapter

## Status

Accepted.

## Context

Bloom needs to validate the full teleoperation path before migrating more
widgets and screens:

1. a runtime joystick emits a generic `value-change` intent;
2. the dashboard maps that intent through a runtime binding;
3. the backend receives the command over WebSocket;
4. a ROS adapter publishes the robot-specific command.

The legacy `tablet_interface` publishes `extender_msgs/msg/TeleopCommand` on
`/teleop_cmd`, and `sandbox_controller` subscribes to that topic. Bloom should
reuse that proven pipe without making generic widgets depend on Extender message
types.

## Decision

Add a persistent runtime WebSocket client for teleop commands in the dashboard.
The frontend maps joystick `value-change` intents to `teleop_cmd` messages only
when the widget declares `runtime_binding.adapter = "teleop"`.

Add a backend teleop command gateway protocol and an rclpy adapter that converts
Bloom runtime teleop commands into `extender_msgs/msg/TeleopCommand` messages.
The adapter lives in `backend/libs/ros_adapters`, not in generic session models.

Keep Explorer mode constants aligned with `TeleopCommand.msg`:

- `ROTATION = 1`;
- `TRANSLATION = 2`;
- `BOTH = 3`;
- `SNAKE = 4`.

For tablet UX, Bloom presets should prefer `BOTH` and avoid cycling through
separate `ROTATION` and `TRANSLATION` modes when the combined mode covers the
workflow. The ROS compatibility modes remain available in app configuration.

## Consequences

- Petanque and imported legacy joysticks can move toward the same backend
  teleop path as `tablet_interface`.
- ROS message dependencies such as `numpy`, required by generated ROS Python
  messages, belong in the backend runtime environment.
- Vite development proxy must support WebSocket traffic so local dashboard
  runtime tests use the same `/api/v1/runtime/ws` endpoint as production.
- The next runtime slice should add topic subscription streaming and a visible
  runtime connection/status panel so teleop failures are easier to diagnose from
  the UI.

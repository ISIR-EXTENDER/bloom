# 0073 - Runtime Slider Topic Bindings

## Status

Accepted.

## Context

The legacy Extender UI uses sliders for robot-facing scalar controls such as
max velocity and vertical axis commands. Bloom already routes joystick vectors
through runtime bindings, but sliders were still mostly UI-only values.

The sandbox end-to-end test needs both:

- joystick vectors published as `extender_msgs/msg/TeleopCommand`;
- scalar sliders published as standard ROS topic messages such as
  `std_msgs/msg/Float64`.

## Decision

Extend slider settings with optional runtime publication metadata:

- `topic`;
- `messageType`;
- `runtime_binding.adapter = "topic"`;
- `runtime_binding.value_mapping.field_path`.

Keep sliders generic by making topic publishing opt-in. A slider with no topic
binding still behaves as a local value widget. A bound slider emits the same
generic `value-change` intent, and the dashboard runtime dispatcher maps that
intent to the ROS publish API.

Add a `Sandbox teleop lab` screen to the sandbox configuration with:

- a translation joystick bound to `/teleop_cmd`;
- a rotation joystick bound to `/teleop_cmd`;
- a horizontal max-velocity slider bound to `/cmd/max_velocity`;
- a vertical Z-axis slider bound to `/cmd/joystick_z`.

## Validation

Validated locally with the sandbox ROS simulation running:

- browser joystick drag emits non-zero WebSocket `teleop_cmd` messages;
- `/teleop_cmd` receives non-zero `extender_msgs/msg/TeleopCommand` values;
- `/sandbox_controller/velocity_command --field twist.linear.x` moves from
  `0.0` to non-zero values and returns to zero on release;
- `/cmd/max_velocity` receives `std_msgs/msg/Float64` values from the runtime
  slider.

## Consequences

- Slider and joystick runtime paths now share the same intent-first model.
- ROS-specific details stay in app configuration and runtime adapters, not in
  renderer components.
- Future scalar controls can reuse the same binding shape for debug, safety,
  velocity limits, or machine-supervision APIs.

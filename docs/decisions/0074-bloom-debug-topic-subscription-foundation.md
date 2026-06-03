# 0074 - Bloom Debug Topic Subscription Foundation

## Status

Accepted.

## Context

Bloom needs in-app robot debugging tools instead of forcing users to keep a
terminal open for every `ros2 topic echo` or quick telemetry check. The long-term
debug direction includes:

- topic catalog inspection;
- topic echo screens;
- minimal PlotJuggler-like scalar plots;
- rosbag-style recording workflows with selected topics and approved folders.

Before adding full streaming and recording, runtime screens need to declare which
topics they want to observe.

## Decision

When a runtime screen contains `topic-echo` or `topic-plot` widgets, Bloom sends
`subscribe_topic` messages over the runtime WebSocket. The backend currently
acknowledges these subscriptions; live message streaming will be added in a
later slice.

Add a tracked `Bloom Debug` fixture with a first `Runtime topic monitor` screen:

- `/teleop_cmd` echo;
- `/sandbox_controller/velocity_command` scalar plot on `twist.linear.x`;
- `/joint_states` echo.

## Consequences

- Debug widgets now participate in the runtime session contract instead of being
  static placeholders only.
- The frontend remains adapter-agnostic: widgets request topic observations, and
  backend adapters decide how to stream ROS or non-ROS data.
- Future rosbag and topic inspector features can reuse the same topic metadata
  path rather than inventing separate debug-specific configuration.

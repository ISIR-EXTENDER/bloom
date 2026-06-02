# 0042 - Runtime ROS Action Dispatcher

## Status

Accepted.

## Context

Bloom widgets already produce runtime intents such as `topic-publish`, `value-change`, or `command`. The previous runtime
preview displayed those intents, which was useful for foundation testing, but supported ROS topic publish actions still did
not leave the frontend.

Legacy `extender_ui` and `tablet_interface` showed that configurable widgets often use CLI-style ROS payloads such as
`{data: [13, 1]}`. Keeping that shape matters because operators and non-web contributors can reason about it with the
same mental model as `ros2 topic pub`.

## Decision

Add a runtime dispatcher in the dashboard:

- `topic-publish` intents with a message type are converted to backend `publishRosTopic` requests;
- string payloads are sent as `payload_text` so the backend can parse ROS CLI/YAML-like mappings;
- object payloads are sent as structured JSON `payload`;
- scalar payloads are wrapped as `{data: value}` for common `std_msgs`-style messages;
- unsupported intents remain visible instead of being silently dropped.

The runtime panel now shows intent details, backend request payloads, and dispatch status (`pending`, `published`,
`simulated`, `unsupported`, or `failed`).

## Consequences

- Bloom can manually test migrated ROS message toggles end-to-end through the frontend and backend boundary.
- The backend remains the only place that parses ROS payload text or talks to ROS adapters.
- Future runtime slices can add dispatchers for sliders, joysticks, topic echo, topic plots, and camera streams without
  changing widget renderers.

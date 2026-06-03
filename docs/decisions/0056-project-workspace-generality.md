# 0056 - Project workspace generality

## Context

Bloom currently models Petanque, Sandbox, and similar experiences as apps. That works for the Extender migration, but
Bloom may later serve other lab machines or supervision tools that are not ROS-based.

Examples:

- an Extender project/workspace containing Petanque, Sandbox, and maintenance apps;
- a C++ machine supervision project using HTTP or WebSocket APIs;
- a future Zenoh-backed or non-ROS robot project.

## Decision

Keep `app` as the current user-facing concept, but avoid blocking a future `project` or `workspace` level above apps.

The future hierarchy should be:

```text
Project / Workspace
  App
    Screen
      Widget
        Integration adapter
```

Do not add this level in the UI yet. Add it when SQLite app/screen storage is stable enough to normalize cleanly,
probably by introducing `project_id` before final table normalization.

## Consequences

- Generic models should not hard-code Extender, Petanque, ROS, or `ros_*` naming.
- Widgets should keep producing generic intents/actions.
- ROS, HTTP, WebSocket, MQTT, C++ bridge, and Zenoh-style integrations should all enter through adapters.
- Bloom stays useful for Extender now without losing the option to become a broader ISIR supervision framework later.

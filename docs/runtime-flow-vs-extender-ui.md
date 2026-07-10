# Bloom Runtime Flow Compared To `extender_ui`

Last updated: 2026-07-10.

## Summary

Bloom now keeps the `extender_ui` operator contract where it matters for robots:
stable command names, normalized joystick vectors, explicit ROS topics, and JSON
migration fixtures. The implementation flow is different on purpose:

- `extender_ui` stores and replays mostly local JSON/UI state, with ROS details
  close to widgets or controller-specific code.
- Bloom saves apps and screens through the backend configuration API, persists
  them in SQLite or JSON storage, and routes robot commands through backend
  runtime adapters.

The goal is to let migrated screens keep their robot behavior while moving
security, persistence, and ROS compatibility into testable backend boundaries.

## Save And Load Flow

In Bloom:

1. The builder edits an `ApplicationConfig` or `ScreenConfig`.
2. The dashboard calls:
   - `PUT /api/v1/configurations/{config_id}/applications/{app_id}`
   - `PUT /api/v1/configurations/{config_id}/applications/{app_id}/screens/{screen_id}`
3. The backend repository persists the configuration.
4. With SQLite storage, the repository writes the full JSON bundle plus
   normalized rows for apps, screens, widgets, runtime policies, action presets,
   profiles, and theme assets.
5. Later API reads reconstruct the configuration from normalized SQLite rows
   when available, with the bundle JSON as the migration/export fallback.
6. The runtime app library opens the saved app and screen from the same backend
   API contract.

In `extender_ui`, the comparable flow is closer to direct JSON/layout sync.
That is useful for rollback and migration fixtures, but Bloom avoids making the
browser the long-term source of truth.

Current validation:

- New apps saved through the API persist across backend restarts with SQLite.
- New screens saved through the API persist across backend restarts with SQLite.
- Real legacy JSON fixtures still round-trip through the configuration API.

## Runtime Action Flow

In Bloom, command widgets emit generic command intents such as
`explorer.deploy`, `explorer.repli`, or `explorer.pose.load.home`.

For saved app runtime commands, the dashboard now calls:

```http
POST /api/v1/runtime/actions
```

with `config_id`, `app_id`, and either `preset_id` or `command`.

The backend then:

1. reloads the saved configuration;
2. resolves the command against the app's saved `action_presets`;
3. rejects commands that are not backed by a saved preset;
4. parses the saved payload or payload text;
5. applies the app runtime policy;
6. applies the global backend ROS runtime policy and rate limit;
7. publishes through the configured ROS publisher gateway;
8. writes runtime audit records for accepted and rejected operations.

This means the browser can ask for a saved command, but it cannot invent a new
topic, message type, or payload for concrete robot actions.

Direct topic-publish widgets remain supported for configurable debug and simple
controls, but they still pass through app policy, backend policy, payload shape
checks, command rate limits, and audit logs.

## ROS Compatibility Notes

Bloom preserves the details that robot controllers observe:

- joystick values stay normalized to the legacy unit-disk contract;
- teleop commands use the runtime WebSocket `teleop_cmd` contract and publish to
  configured targets such as `/teleop_cmd`;
- sliders and toggles publish explicit app-configured ROS message types and
  payload fields;
- Explorer deploy/repli, saved pose replay, favorite mode/layout/position,
  emergency stop, and gripper commands are now concrete app action presets;
- Sandbox and Petanque fixtures keep their topic/message allowlists aligned
  with backend defaults through validation checks.

The split from `extender_ui` is that ROS transport lives behind backend adapters.
The frontend owns operator interaction, widget rendering, and saved command
identity; the backend owns ROS process access, policy, rate limiting, and audit.

## Rosbag Gateway Operating Procedure

The rosbag gateway stays opt-in. The safe default is a simulated recording
gateway for CI and non-ROS development.

Accepted procedure for a sourced ROS workspace:

```bash
source /home/susana/workspace/extender/extender_workspace/install/setup.bash
cd /home/susana/workspace/extender/bloom
export BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag
export BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY="$PWD/backend/data/recordings"
export BLOOM_ALLOWED_RECORDING_TOPICS="/teleop_cmd,/joint_states"
cd backend
uv run python -m apps.bloom_cli.main api run --host 127.0.0.1 --port 8000
```

Then start a recording from Bloom Debug or with:

```bash
curl -X POST http://localhost:8000/api/v1/runtime/recordings \
  -H 'Content-Type: application/json' \
  -d '{"topics":["/teleop_cmd"],"output_folder":"data/recordings","label":"sandbox"}'
```

Stop with:

```bash
curl -X POST http://localhost:8000/api/v1/runtime/recordings/{recording_id}/stop
```

After stopping, verify the bag from the sourced shell:

```bash
ros2 bag info backend/data/recordings/<recording-folder>
```

Operational rules:

- only enable `BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag` in a sourced ROS shell;
- keep recording topics in `BLOOM_ALLOWED_RECORDING_TOPICS`;
- keep output folders relative and approved by the backend settings;
- do not use wildcard publish policies for robot-facing sessions;
- keep API-key auth enabled for shared lab or production-style runs.

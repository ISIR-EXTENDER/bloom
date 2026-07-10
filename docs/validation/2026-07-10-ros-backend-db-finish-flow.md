# 2026-07-10 ROS Backend And DB Finish Flow

Status: accepted for backend/runtime contract validation.

## Scope

This record covers the migration slice focused on ROS compatibility, backend
runtime safety, database save/load behavior, and the Bloom flow comparison with
`extender_ui`.

## Accepted

- Saved runtime commands can be dispatched through `POST /api/v1/runtime/actions`.
- The backend resolves runtime actions from the saved configuration and refuses
  commands that are not backed by an app `action_presets` entry.
- App runtime policy is enforced before the ROS publisher gateway is called.
- Global backend ROS policy, payload shape validation, rate limiting, and audit
  records still apply through the existing safe publish path.
- Explorer user-test concrete adapters are represented as app presets:
  deploy, repli, safe-zone enable, save pose, replay home/meal/work poses,
  cancel pose, favorite mode/layout, emergency stop, and gripper close.
- SQLite save/load tests cover creating a new app and creating a new screen via
  the API, then reloading the configuration from a fresh backend instance.
- The current Bloom flow and `extender_ui` differences are documented in
  `docs/runtime-flow-vs-extender-ui.md`.

## Checks

Commands run locally:

```bash
npm run test --workspace @bloom/api-client -- --run src/index.test.ts
npm run test --workspace @bloom/dashboard -- --run src/runtime/runtime-action-dispatcher.test.ts
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run --directory backend pytest tests/test_runtime_api.py tests/test_configurations_api.py
```

Results:

- `@bloom/api-client`: 19 passed.
- `@bloom/dashboard` runtime dispatcher: 21 passed.
- Backend runtime/configuration API: 44 passed.

## Rosbag Procedure

The opt-in rosbag operating procedure remains:

```bash
source /home/susana/workspace/extender/extender_workspace/install/setup.bash
cd /home/susana/workspace/extender/bloom
export BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag
export BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY="$PWD/backend/data/recordings"
export BLOOM_ALLOWED_RECORDING_TOPICS="/teleop_cmd,/joint_states"
cd backend
uv run python -m apps.bloom_cli.main api run --host 127.0.0.1 --port 8000
```

Start and stop recordings through Bloom Debug or the runtime recordings API.
Verify the resulting folder with `ros2 bag info` from the same sourced shell.

This PR records the accepted operating procedure and keeps the gateway opt-in.
It does not claim a fresh live rosbag capture was recorded in this local run.

## Remaining Live Gates

- Full Sandbox V0.0 runtime against the sandbox simulation.
- Robin visual-servoing live camera/tag/velocity/error path.
- Live Petanque stack/operator parity before retiring any legacy workflow.

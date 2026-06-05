# Extender Workspace Deployment Notes

Bloom should stay a web product with adapter boundaries, not a low-level ROS package. During the transition, the safest
Extender integration is a workspace-level entrypoint that starts Bloom next to the existing ROS workspace and legacy
packages.

## Local Lab Entrypoint

From the Bloom repository:

```bash
scripts/extender-workspace-dev.sh
```

The script:

- sources the Extender ROS workspace setup file;
- starts the Bloom API with ROS publisher, teleop, and topic-stream adapters;
- starts the Bloom dashboard through Vite;
- optionally applies the HMTECH touchscreen mapping;
- stops both processes when the terminal exits.

## Useful Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXTENDER_WORKSPACE` | `/home/susana/workspace/extender/extender_workspace` | ROS workspace root. |
| `EXTENDER_SETUP_FILE` | `$EXTENDER_WORKSPACE/install/setup.bash` | Setup file to source before starting ROS adapters. |
| `BLOOM_API_HOST` | `127.0.0.1` | API bind host. |
| `BLOOM_API_PORT` | `8000` | API port. |
| `BLOOM_FRONTEND_HOST` | `127.0.0.1` | Dashboard dev-server host. |
| `BLOOM_FRONTEND_PORT` | `5173` | Dashboard dev-server port. |
| `BLOOM_APPLY_TABLET_TOUCH_MAP` | `0` | Set to `1` to run `scripts/extender-tablet-touch-map.sh` before launch. |

## Recording Variables

Bloom Debug can keep using the simulated recording gateway for UI and CI checks. For ROS-enabled lab sessions, opt into
real rosbag process management explicitly:

```bash
export BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag
export BLOOM_ALLOWED_RECORDING_TOPICS='/teleop_cmd,/joint_states,/sandbox_controller/velocity_command'
export BLOOM_ALLOWED_RECORDING_OUTPUT_FOLDERS='data/recordings'
export BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY="$PWD/backend"
export BLOOM_RUNTIME_RECORDING_EXECUTABLE=ros2
```

Recording remains constrained by both topic and folder allowlists. Keep folders relative and approved so a dashboard
operator cannot write bags outside the intended Bloom data area.

## Security Variables

For shared lab tablets or staging deployments, enable the Phase 5 API perimeter:

```bash
export BLOOM_AUTH_ENABLED=true
export BLOOM_ADMIN_API_KEY='replace-with-admin-secret'
export BLOOM_OPERATOR_API_KEY='replace-with-operator-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://127.0.0.1:5173,http://tablet.local:5173'
```

The frontend still needs a user-facing key/session workflow before this is comfortable for non-developer operators. Until
then, keep authentication disabled only on trusted local machines, and enable it for deployment-style checks.

## Validation Checklist

Before replacing a legacy workflow with Bloom:

- build and source the Extender workspace;
- launch the sandbox simulation with the existing `sandbox_controller` launch file;
- start Bloom with `scripts/extender-workspace-dev.sh`;
- open the Sandbox teleop lab app in runtime;
- move the translation/rotation joysticks and verify `/teleop_cmd` plus robot motion in RViz/Gazebo;
- open Bloom Debug and verify topic catalog, topic echo, plot, audit, and recording controls;
- open Petanque candidate screens and validate camera/debug/state-machine interactions against the legacy behavior.

## Legacy Retirement Rule

This entrypoint does not retire `extender_ui` or `tablet_interface`. Legacy packages should only be marked legacy after
the required Extender and Petanque workflows are validated end-to-end in Bloom and accepted by users.

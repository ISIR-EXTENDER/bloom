# Extender Workspace Deployment Notes

Bloom is the active Extender IHM and stays a web product with adapter boundaries, not a low-level ROS package. The
workspace-level entrypoint starts Bloom next to the existing ROS controllers, simulation, and robot packages.
`extender_ui` is legacy and is not part of the normal launch path.

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

### One API process

Run exactly one Bloom API process and one replica for a robot-facing deployment. Runtime command ownership is held in
that process; `uvicorn --workers 2`, two containers, or load balancing across replicas would create independent owners
and defeat the one-operator guarantee. The maintained `bloom api run`, `bloom api run-ros`, and workspace script all
start one process. A shared lease coordinator is required before scaling the command API horizontally.

## Useful Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXTENDER_WORKSPACE` | `/home/susana/workspace/extender/extender_workspace` | ROS workspace root. |
| `EXTENDER_SETUP_FILE` | `$EXTENDER_WORKSPACE/install/setup.bash` | Setup file to source before starting ROS adapters. |
| `BLOOM_API_HOST` | `127.0.0.1` | API bind host. |
| `BLOOM_API_PORT` | `8000` | API port. |
| `BLOOM_FRONTEND_HOST` | `127.0.0.1` | Dashboard dev-server host. |
| `BLOOM_FRONTEND_PORT` | `5173` | Dashboard dev-server port. |
| `BLOOM_API_PROXY_TARGET` | `http://127.0.0.1:$BLOOM_API_PORT` | Server-side Vite target for HTTP and WebSocket API traffic. |
| `BLOOM_PUBLIC_HOST` | first address from `hostname -I` | Address printed for another device when the frontend uses a wildcard bind. |
| `BLOOM_RUNTIME_CONTROL_REQUIRED` | `true` | Require one Runtime session to own robot commands; production refuses `false`. |
| `BLOOM_APPLY_TABLET_TOUCH_MAP` | `0` | Set to `1` to run `scripts/extender-tablet-touch-map.sh` before launch. |
| `DISPLAY_MODE` | empty | Optional tablet display mode passed to the touch-map helper, for example `1280x720`. |
| `LOGICAL_DISPLAY_SIZE` | empty | Optional scaled tablet workspace, for example `1820x720`. |
| `APPLY_DISPLAY_MODE` | `0` | Set to `1` to apply `DISPLAY_MODE` before remapping touch. |
| `PLACE_OUTPUT_RIGHT_OF` | empty | Optional laptop output to place to the left of the tablet, for example `eDP-1`. |

Current Extender tablet setup:

```bash
BLOOM_APPLY_TABLET_TOUCH_MAP=1 \
DISPLAY_MODE=1280x720 \
LOGICAL_DISPLAY_SIZE=1820x720 \
APPLY_DISPLAY_MODE=1 \
PLACE_OUTPUT_RIGHT_OF=eDP-1 \
scripts/extender-workspace-dev.sh
```

## Same Wi-Fi Access

For a phone or tablet on the same trusted network, expose the dashboard while keeping FastAPI on loopback:

```bash
LAN_IP="$(hostname -I | awk '{print $1}')"

BLOOM_API_HOST=127.0.0.1 \
BLOOM_FRONTEND_HOST=0.0.0.0 \
BLOOM_PUBLIC_HOST="${LAN_IP}" \
scripts/extender-workspace-dev.sh
```

Open the printed `http://<lan-ip>:5173` URL from the other device. Vite serves the frontend on the LAN and proxies
same-origin `/api` HTTP and WebSocket requests to `http://127.0.0.1:8000`. This avoids exposing port `8000` directly and
needs no CORS entry for the phone. A custom API port stays aligned automatically; for a separately hosted API, set
`BLOOM_API_PROXY_TARGET` explicitly.

Verify from the host and then from the phone:

```bash
curl -fsS http://127.0.0.1:5173/api/v1/health
curl -fsS "http://${LAN_IP}:5173/api/v1/health"
```

If the second request is blocked by UFW, allow the dashboard only from the actual lab subnet, for example:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 5173 proto tcp
```

Replace that CIDR with the network in use. Do not expose the Vite development server through router port forwarding,
a public Wi-Fi network, or the internet. The dashboard has no user-facing API-key sign-in flow yet, so this recipe is
for a trusted local lab network. An internet or shared institutional deployment needs the production authentication
perimeter and a reviewed reverse proxy/session design.

### Shared Database Behavior

All browsers talk to the one API process, whose default store is `backend/data/bloom.db`. The browser does not load or
save local JSON files. A Builder save updates that shared SQLite store; another device sees it after reloading. Seed
imports add missing application IDs and do not overwrite local edits.

Use the CLI from the host to inspect or publish the shared state:

```bash
cd backend
uv run python -m apps.bloom_cli.main config status
uv run python -m apps.bloom_cli.main config publish explorer-manager
```

Two stale Builder drafts can still overwrite one another at the application/screen level, so do not edit the same app
concurrently. Stop Bloom before backing up or replacing the database:

```bash
cd /path/to/bloom
cp backend/data/bloom.db "backend/data/bloom-$(date +%F-%H%M%S).db"
```

The backup remains local and ignored by Git. Shared app changes belong in a published seed JSON commit, not in the
SQLite file.

## Recording Variables

Bloom Debug can keep using the simulated recording gateway for UI and CI checks. For ROS-enabled lab sessions, opt into
real rosbag process management explicitly:

```bash
export BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag
export BLOOM_ALLOWED_RECORDING_TOPICS='/cartesian_command,/joystick_cartesian_command,/mode_request,/joint_states,/ee_pose,/ee_velocity,/tag_detections,/visual_servoing/velocity_command'
export BLOOM_ALLOWED_RECORDING_OUTPUT_FOLDERS='data/recordings'
export BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY="$PWD/backend"
export BLOOM_RUNTIME_RECORDING_EXECUTABLE=ros2
```

Recording remains constrained by both topic and folder allowlists. Keep folders relative and approved so a dashboard
operator cannot write bags outside the intended Bloom data area.

## Runtime ROS Policy Variables

The app configuration should remain the first guardrail, but lab sessions can also tune the backend runtime policy
without editing code:

```bash
export BLOOM_ALLOWED_ROS_PUBLISH_TOPICS='/explorer_user_interfaces/rqt_armcontrol/max_angular_speed,/explorer_user_interfaces/rqt_armcontrol/max_linear_speed,/gripper_controller/commands,/mode_request'
export BLOOM_ALLOWED_ROS_MESSAGE_TYPES='std_msgs/msg/Float64,std_msgs/msg/Float64MultiArray,std_msgs/msg/String'
export BLOOM_ALLOWED_TELEOP_TARGETS='/joystick_cartesian_command'
export BLOOM_ROBOT_NAME='Explorer'
export BLOOM_ROS_COMMAND_FRAME_ID='base_link'
export BLOOM_ALLOWED_COMMAND_FRAME_IDS='base_link,ft_frame,hybrid_frame'
export BLOOM_ALLOWED_ROS_SERVICE_CALLS='/fault_controller/reset_fault'
export BLOOM_ALLOWED_ROS_SERVICE_TYPES='example_interfaces/srv/Trigger,std_srvs/srv/Trigger'
export BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND=60
export BLOOM_RUNTIME_CONTROL_REQUIRED=true
```

Keep the backend command ceiling at or above `60` for the shipped runtime. Bloom coalesces all composed teleop inputs
to at most 30 moving commands/s and sends neutral commands immediately; the 2x margin prevents normal tablet timing
jitter from tripping the server guard. A lower ceiling is valid only when the client stream is configured and tested
to match it.

Avoid `*` for robot-facing sessions unless you are deliberately running a temporary diagnostic setup. Prefer adding the
smallest topic/message set needed by the app under test. The example is a Manager Drive allowlist; do not reuse it for
Sandbox or archived Petanque without adding their explicitly reviewed topics.

The backend frame is the fallback. Each app may select one value from the reported frame allowlist under **Builder > App
configuration > Adapter guardrails**. That application frame is then shared by all virtual Cartesian controls and a
physical gamepad and is displayed in the kiosk bar.

## Security Variables

For shared lab tablets or staging deployments, enable the API perimeter:

```bash
export BLOOM_AUTH_ENABLED=true
export BLOOM_ADMIN_API_KEY='replace-with-admin-secret'
export BLOOM_OPERATOR_API_KEY='replace-with-operator-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://127.0.0.1:5173,http://tablet.local:5173'
```

The frontend still needs a user-facing key/session workflow before this is comfortable for non-developer operators. Until
then, keep authentication disabled only on trusted local machines, and enable it for deployment-style checks.

## Validation Checklist

Before a robot-facing Bloom session or release:

- build and source the Extender workspace;
- verify the Bloom API is one process and one replica, with no multi-worker or load-balanced command path;
- launch `cartesian_manager` with its Explorer bringup, or the legacy `sandbox_controller` launch file when
  running the rollback path;
- start Bloom with `scripts/extender-workspace-dev.sh`;
- verify ROS graph diagnostics in Bloom Debug or with `GET /api/v1/ros/topics/status` for
  `/joystick_cartesian_command`, `/cartesian_command`, `/joint_states`, and `/ee_velocity`;
- open the Sandbox teleop lab app in runtime;
- confirm the kiosk bar names the expected robot, frame, profile, and link state;
- confirm the operator kiosk says **YOU CONTROL**; open the same app in a second Runtime tab and verify its artboard is
  inert, its **Take control** action cannot force handover, and its STOP remains available;
- close the owner tab, claim from the waiting tab, and verify release-to-zero precedes the first command from the new
  owner; repeat with an abrupt owner disconnect;
- move the translation/rotation joysticks and Z/RZ controls, then verify `/cartesian_command`, release-to-zero, and robot
  motion in RViz/Gazebo;
- validate Neutral, Jaco, momentary Snake, gripper, speed limits, and the fixed STOP/backend resume latch;
- open the current app's Supervisor mirror on a second display, verify ownership plus shared STOP/topic state, and
  confirm that no movement, STOP, resume, publish, action, or takeover controls are present there;
- connect any intended gamepad or assistive input and verify its real mapping and disconnect behavior;
- open Bloom Debug and verify topic catalog, topic echo, plot, audit, and recording controls;
- if archived Petanque is still required, open its screens and validate camera/debug/state-machine interactions against
  the legacy behavior.

## Legacy Retirement Rule

Bloom is the active IHM and `extender_ui` is legacy. Keep the legacy repository available as a behavior reference and
emergency rollback until the relevant live sessions are accepted; marking it legacy does not require deleting it.
Low-level Extender ROS packages remain active. See [legacy retirement gates](legacy-retirement-gates.md) for the separate
cleanup decision.

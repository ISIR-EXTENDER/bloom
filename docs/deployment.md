# Deployment And Lab Hardware

How Bloom starts next to the Extender ROS stack, what each environment variable does, and how the lab touchscreen is
set up. Bloom stays a web product with adapter boundaries, not a low-level ROS package: nothing here builds or launches
a robot, which is the workspace's job. `extender_ui` is legacy and is not part of the normal launch path.

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

## Node.js

Bloom requires Node.js 24, the current LTS line, pinned in `.nvmrc`. The Extender and Kinova computers install Node from
the NodeSource apt repository, so moving an older machine to Node 24 means switching that repository:

```bash
sudo sed -i 's|node_[0-9]*\.x|node_24.x|' /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
node --version   # v24.x
```

The floor is 24.15.0, from `engines.node` in `package.json`, because jsdom 30 supports the 24 line from there. A
machine on an older Node 22.12 or later can still start the dev server, and the launcher warns, but it cannot run the
test suites.

## Useful Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXTENDER_WORKSPACE` | `extender_workspace` next to this repository | ROS workspace root. |
| `EXTENDER_SETUP_FILE` | `$EXTENDER_WORKSPACE/install/setup.bash` | Setup file to source before starting ROS adapters. |
| `BLOOM_API_HOST` | `127.0.0.1` | API bind host. |
| `BLOOM_API_PORT` | `8000` | API port. |
| `BLOOM_FRONTEND_HOST` | `127.0.0.1` | Dashboard dev-server host. |
| `BLOOM_FRONTEND_PORT` | `5173` | Dashboard dev-server port. |
| `BLOOM_API_PROXY_TARGET` | `http://127.0.0.1:$BLOOM_API_PORT` | Server-side Vite target for HTTP and WebSocket API traffic. |
| `BLOOM_PUBLIC_HOST` | first address from `hostname -I` | Address printed for another device when the frontend uses a wildcard bind. |
| `BLOOM_RUNTIME_CONTROL_REQUIRED` | `true` | Require one Runtime session to own robot commands; production refuses `false`. |
| `BLOOM_SEED_SHARED_APPLICATIONS` | `true` | Import and upgrade shipped applications at API start. |
| `BLOOM_TELEOP_TARGET_PARAMETERS` | manager `topics.*_command` | `<node>:<parameter>` pairs naming the manager's input topics a joystick may drive. |
| `BLOOM_CAMERA` | `auto` | `scripts/extender-workspace-dev.sh` only: the camera `camera_interface` starts; `none` skips it, or name a driver (`usb_cam`, `camera_ros`, `kinova_vision`). |
| `BLOOM_SEED_DIR` | `backend/seed/applications` | Where the shared applications live; the Builder's **Share** writes here. |
| `BLOOM_THEME_ASSET_DIR` | `data/theme-assets` | Where uploaded theme images are stored. |
| `BLOOM_API_PREFIX` | `/api/v1` | API route prefix. The dashboard calls `/api/v1`, so change it only behind a proxy that maps it back. |
| `BLOOM_APP_NAME`, `BLOOM_SERVICE_NAME`, `BLOOM_APP_DESCRIPTION` | Bloom defaults | Names reported by the API and its OpenAPI page. |
| `BLOOM_APP_VERSION` | the release version | Version the API reports. Leave it unset, or it hides the real version. |
| `BLOOM_APPLY_TABLET_TOUCH_MAP` | `auto` | `auto` maps the tablet's touch when it is plugged in, `1` always runs `scripts/extender-tablet-touch-map.sh`, `0` never does. A failed mapping never stops Bloom. |
| `DISPLAY_MODE` | empty | Optional tablet display mode passed to the touch-map helper, for example `1280x720`. |
| `LOGICAL_DISPLAY_SIZE` | empty | Optional scaled tablet workspace, for example `1820x720`. |
| `APPLY_DISPLAY_MODE` | `0` | Set to `1` to apply `DISPLAY_MODE` before remapping touch. |
| `PLACE_OUTPUT_RIGHT_OF` | empty | Optional laptop output to place to the left of the tablet, for example `eDP-1`. |

Current Extender tablet setup maps touch only and keeps the mode the tablet comes up in:

```bash
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
same-origin `/api` HTTP and WebSocket requests to `http://127.0.0.1:8000`. This avoids exposing port `8000` directly. A
custom API port stays aligned automatically; for a separately hosted API, set `BLOOM_API_PROXY_TARGET` explicitly.

The API refuses a runtime WebSocket from a browser page whose origin it does not know, so the phone's page origin must
be allowed. Unless `BLOOM_CORS_ALLOWED_ORIGINS` is already set, the launcher allows the loopback dashboard origins and
`http://<BLOOM_PUBLIC_HOST>:<frontend port>` before it starts the API. A device reaching the dashboard under another
name, or a port Vite moved to, is refused until that origin is added.

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
export BLOOM_ALLOWED_RECORDING_TOPICS='/cartesian_command,/joystick_cartesian_command,/mode_request,/joint_states,/ee_jac,/ee_pose,/ee_velocity,/tag_detections,/visual_servoing/velocity_command'
export BLOOM_ALLOWED_RECORDING_OUTPUT_FOLDERS='data/recordings'
export BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY="$PWD/backend"
export BLOOM_RUNTIME_RECORDING_EXECUTABLE=ros2
```

Recording remains constrained by both topic and folder allowlists. Keep folders relative and approved so a dashboard
operator cannot write bags outside the intended Bloom data area.

Start the API from that sourced shell, then start a recording from Bloom Debug or over the API:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/runtime/recordings \
  -H 'Content-Type: application/json' \
  -d '{"topics":["/cartesian_command"],"output_folder":"data/recordings","label":"bench"}'

curl -X POST http://127.0.0.1:8000/api/v1/runtime/recordings/{recording_id}/stop
```

After stopping, verify the bag from the same sourced shell:

```bash
ros2 bag info backend/data/recordings/<recording-folder>
```

Enable the rosbag gateway only in a sourced ROS shell, keep every recorded topic in `BLOOM_ALLOWED_RECORDING_TOPICS`,
keep output folders relative, and never use a wildcard publish policy for a robot-facing session.

## Runtime ROS Policy Variables

The app configuration should remain the first guardrail, but lab sessions can also tune the backend runtime policy
without editing code. The two layers intersect: an app can only narrow what the server allows, never widen it. A
joystick may drive any input cartesian_manager declares: the API reads the input topic names from the manager's
parameters (`BLOOM_TELEOP_TARGET_PARAMETERS`, by default `topics.joystick_command` and `topics.visual_servoing_command`
on `/cartesian_manager`) every few seconds, so renaming or adding a manager input needs nothing on the Bloom side.
`BLOOM_ALLOWED_TELEOP_TARGETS` only adds topics beyond those, and keeps the manager's default while it is not up yet.
A joystick pointed at a topic nothing on the robot takes is refused; the Builder names the manager's inputs, and the
runtime marks such a joystick unavailable, with the reason, before anyone presses it.

```bash
export BLOOM_ALLOWED_ROS_PUBLISH_TOPICS='/explorer_user_interfaces/rqt_armcontrol/max_angular_speed,/explorer_user_interfaces/rqt_armcontrol/max_linear_speed,/gripper_controller/commands,/mode_request'
export BLOOM_ALLOWED_ROS_MESSAGE_TYPES='std_msgs/msg/Float64,std_msgs/msg/Float64MultiArray,std_msgs/msg/String'
export BLOOM_ALLOWED_TELEOP_TARGETS='/joystick_cartesian_command'
export BLOOM_ROBOT_NAME='Explorer'
export BLOOM_ROS_COMMAND_FRAME_ID='base_link'
export BLOOM_ALLOWED_COMMAND_FRAME_IDS='base_link,effector_frame,hybrid_frame'
# The node whose robot_description the 3D robot view draws, with its meshes served from the package share.
export BLOOM_ROS_ROBOT_DESCRIPTION_NODE='/robot_state_publisher'
export BLOOM_ALLOWED_ROS_SERVICE_CALLS='/fault_controller/reset_fault'
export BLOOM_ALLOWED_ROS_SERVICE_TYPES='example_interfaces/srv/Trigger,std_srvs/srv/Trigger'
export BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND=60
# The newest sample per topic, this many times a second at most, on each runtime socket; 0 forwards every one.
export BLOOM_RUNTIME_TOPIC_MAX_RATE_HZ=30
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
# Read-only, for a supervisor mirror on a second screen.
export BLOOM_OBSERVER_API_KEY='replace-with-observer-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://127.0.0.1:5173,http://tablet.local:5173'
```

Build the dashboard with the matching operator key so it can reach an authenticated backend:

```bash
VITE_BLOOM_API_KEY='replace-with-operator-secret' npm run build --workspace @bloom/dashboard
```

Build a supervisor screen with the observer key instead, so the machine watching cannot command the arm even if
someone reaches its keyboard.

Point the build at the API with `VITE_BLOOM_API_URL`, serve its `dist` directory with any static server, for example
`npm exec --workspace @bloom/dashboard -- vite preview --host 0.0.0.0 --port 4173`, and add that origin to
`BLOOM_CORS_ALLOWED_ORIGINS`, which the runtime socket also checks.

The key is baked into the bundle, so serve that build only to the machines the key is meant for. The same holds for the
dev server: in same-Wi-Fi mode every device that opens it gets the one key it was started with. Bloom still has no
per-person sign-in: one deployment holds one operator key, which is enough for a lab tablet and not enough for a shared
public machine.

## Tablet Hardware

The touchscreen used for Extender tests. Update this when the lab changes the panel, the display configuration, or
the touch mapping workflow.

### Current Touchscreen

| Field | Value |
| --- | --- |
| Name | HMTECH Raspberry Pi Touch Screen Monitor |
| Price reference | 63.99 EUR on 2026-05-06 |
| Panel resolution | 1024x600 |
| Image format | 16:9 |
| Size | 10.1 inches |
| Refresh rate | 60 Hz |
| Power consumption | 10 W |
| Connectors | HDMI + micro-USB |
| Touch | Multitouch |
| Purchase link | <https://www.amazon.fr/gp/product/B098762GVK/ref=ox_sc_act_title_3?smid=A2P7XMHXRVMQHR&th=1> |
| Box contents | 1 touchscreen, 1 HDMI cable, 1 micro-USB cable, 1 stand, 6 screws |

### Linux Display Setup

Although the physical panel is documented as `1024x600`, the current GNOME display configuration exposes the tablet as
`1280x720`. Keep the mode the tablet comes up in: that is the setup that worked before the move to Ubuntu 24.04, and
forcing a mode with `xrandr` makes GNOME rework its monitors, which is where the touch matrix gets lost. The
`1820x720` logical scale below is kept for reference only.

Bloom must therefore be tested on:

- `1024x600`: native panel constraint and worst-case UI density.
- `1280x720`: mode shown by GNOME settings for the HMTECH display.
- `1820x720`: the logical scale used for a while in 2026; no longer the default.

Useful inspection commands:

```bash
xrandr --query
xinput list
```

Current touch mapping command, which leaves the display mode alone:

```bash
./scripts/extender-tablet-touch-map.sh
```

It is what `xinput map-to-output "HID 27c0:0818" HDMI-1` did, found by USB id rather than by name and computed from
the live `xrandr` geometry. Force a mode (`DISPLAY_MODE=… APPLY_DISPLAY_MODE=1`) only when the tablet comes back in a
wrong one.

### After The Move To Ubuntu 24.04

Start any tablet session that misbehaves with the read-only diagnosis, and keep its output:

```bash
./scripts/extender-tablet-touch-map.sh --diagnose
```

It prints the session type, the outputs and their geometry, every xinput device from the touch controller
(`TOUCH_USB_ID`, `27c0:0818`) with its role and current matrix, GNOME's own touchscreen mapping, and the autostart
entries that touch the mapping. Three things changed with 24.04 and GNOME 46 that can each break the old one-liner:

- **One controller, several devices.** Newer kernels expose one HID controller as several xinput devices. The
  helper now finds the direct-touch pointer by its USB id and maps it by device id, so a name shared by two devices
  cannot make `xinput` refuse.
- **GNOME maps touchscreens too.** On a display change it can put its own matrix back over the one `xinput` set.
  `--gnome` tells GNOME which monitor the touchscreen belongs to (the tablet's EDID identity, read from Mutter), so it
  keeps the mapping through hotplug and mode changes:

  ```bash
  DISPLAY_OUTPUT=HDMI-1 ./scripts/extender-tablet-touch-map.sh --gnome
  ```

- **Two autostart entries racing.** One autostart entry that maps before the display mode changes leaves a matrix
  computed on the old geometry. Keep a single entry, the one `--install-autostart` writes.

### Symptoms To Watch

- Pointer and touch positions feel offset from visual controls.
- Touch events are mapped to the wrong monitor/output after boot or reconnect.
- Large runtime screens fit visually but touch targets feel too small on the physical tablet.
- Browser zoom or desktop scaling changes the effective target size.

### Manual Calibration Checklist

1. Connect HDMI and micro-USB touch cable.
2. Run `xrandr --query` and confirm the active output name, currently `HDMI-1`.
3. Run `xinput list` and confirm the touchscreen device name, currently `HID 27c0:0818`.
4. Apply the mapping:

   ```bash
   xinput map-to-output "HID 27c0:0818" HDMI-1
   ```

5. Open a Bloom Manager app and verify both joysticks, Z/RZ sliders, mode controls, gripper, and fixed STOP under touch.
6. Confirm the kiosk bar reports the expected robot, command frame, profile, and link state without wrapping over STOP
   or the artboard.
7. Hold Maintenance for 1.5 seconds, switch screens, return to operation, then verify STOP and the one-second resume
   hold at the panel edges.
8. If a physical gamepad or assistive input is part of the session, connect and exercise it after touch mapping is
   confirmed. A browser-level test does not validate the actual device mapping.

### Touch Mapping Automation

Start with the smallest reliable automation. The command depends on X11 `xinput`, so it should run after the graphical
session starts, not during early boot.

#### Option A - Local Script

Bloom keeps a versioned helper script at `scripts/extender-tablet-touch-map.sh`. You can either run it from the repo or
copy it to `~/bin/extender-tablet-touch-map.sh` on the tablet:

```bash
./scripts/extender-tablet-touch-map.sh
```

Preview the command without changing the current session:

```bash
./scripts/extender-tablet-touch-map.sh --dry-run
```

Override names if Linux reports a different device or output:

```bash
TOUCH_DEVICE="HID 27c0:0818" DISPLAY_OUTPUT="HDMI-1" ./scripts/extender-tablet-touch-map.sh
```

If the HDMI output comes back with the wrong resolution, the same helper can apply the display mode before remapping the
touchscreen:

```bash
DISPLAY_MODE=1280x720 APPLY_DISPLAY_MODE=1 ./scripts/extender-tablet-touch-map.sh
```

The logical scale used for a while in 2026, kept for reference; it is not the default any more:

```bash
DISPLAY_MODE=1280x720 LOGICAL_DISPLAY_SIZE=1820x720 APPLY_DISPLAY_MODE=1 PLACE_OUTPUT_RIGHT_OF=eDP-1 ./scripts/extender-tablet-touch-map.sh
```

Use the resolution command intentionally: it can move windows between monitors during an active desktop session.

By default the helper calculates and applies the exact `Coordinate Transformation Matrix` from `xrandr` geometry. This is
more reliable than raw `xinput map-to-output` in overlapping or recently resized multi-monitor layouts. Set
`USE_EXACT_TOUCH_MATRIX=0` only if you explicitly want the native `xinput map-to-output` behavior.

#### Option B - Desktop Autostart

If the tablet uses a desktop session, add `~/.config/autostart/extender-tablet-touch-map.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Extender tablet touch mapping
Exec=/home/susana/workspace/extender/bloom/scripts/extender-tablet-touch-map.sh
X-GNOME-Autostart-enabled=true
```

The helper can install this entry automatically:

```bash
./scripts/extender-tablet-touch-map.sh --install-autostart
```

Install it with the current Extender tablet layout:

```bash
./scripts/extender-tablet-touch-map.sh --install-autostart
```

It maps once, at login. A tablet plugged in later is mapped when Bloom's launcher starts (`BLOOM_APPLY_TABLET_TOUCH_MAP`
is `auto`), and `--gnome` lets GNOME keep the mapping itself at every hotplug.

This is the preferred low-maintenance option when the only recurring issue is touch mapping after reconnect or reboot.

#### Option C - User systemd Service

Use this when the desktop environment supports user services and the display variables are stable:

```ini
[Unit]
Description=Map Extender touchscreen to HDMI output
After=graphical-session.target

[Service]
Type=oneshot
Environment=DISPLAY=:0
ExecStart=/home/susana/workspace/extender/bloom/scripts/extender-tablet-touch-map.sh

[Install]
WantedBy=default.target
```

Enable with:

```bash
systemctl --user enable --now extender-tablet-touch-map.service
```

If `xinput` cannot connect to the display from systemd, prefer the desktop autostart approach.

### Layout Validation Targets

For every production-level builder/runtime change, validate at least:

- `1024x600`: no essential button is unreachable; controls remain touchable.
- `1280x720`: the `native-1280x720` operator canvas and kiosk chrome fit the GNOME-reported panel mode.
- `1820x720`: layout uses the current lab tablet workspace well without becoming sparse or visually disconnected.
- Runtime teleop: joystick and slider touch positions match visible controls; release returns the composed command to
  zero; the fixed STOP never overlaps an app control.
- Kiosk: app, state, robot, command frame, gamepad, and profile remain readable; maintenance requires a deliberate hold.
- Virtual IHM: Translation, Rotation, Height, Pivot, Neutral, Jaco, momentary Snake, gripper, and speed controls are all
  reachable on the intended screen.
- Accessibility: exercise every profile/input the app claims, including keyboard, step, latch, scan, dwell, or gamepad.
- Builder: app config, device-size warning, screen lists, and inspectors remain readable without horizontal scrolling.

Maintained Manager apps author their operator screens with `native-1280x720` and fit them into the available runtime
viewport. Fit can still reduce authored dimensions at `1024x600`; the builder's selected-widget glass-size warning is a
design aid, not proof that the complete screen meets the physical target floor.

The target is not only "no clipping"; it is calm, readable, touchable operation under real lab conditions.

## Validation Checklist

Before a robot-facing Bloom session or release:

- build and source the Extender workspace;
- verify the Bloom API is one process and one replica, with no multi-worker or load-balanced command path;
- launch `cartesian_manager` with its Explorer or Kinova bringup, or the legacy `sandbox_controller` launch file when
  running the rollback path. In simulation the Explorer launch needs the two runtime workarounds in
  [the simulation run](validation/ros-sim-e2e.md), and the Kinova needs `kortex_description` and `robotiq_description`
  built in the workspace on the Jazzy baseline;
- start Bloom with `scripts/extender-workspace-dev.sh`;
- verify ROS graph diagnostics in Bloom Debug or with `GET /api/v1/ros/topics/status` for
  `/joystick_cartesian_command`, `/cartesian_command`, `/joint_states`, and `/ee_velocity`;
- open **Explorer Manager** or **Kinova Manager** in runtime, as Operator and as Bench;
- confirm the kiosk bar names the expected app, screen, frame and role, and the maintenance sheet the expected link,
  profile and device class. The robot name is no longer in the bar; read it on the supervisor mirror or from
  `GET /api/v1/capabilities`;
- confirm the kiosk reads `READY` and the maintenance sheet's Link fact adds **you control the robot**; open the same
  app in a second Runtime tab and verify it reads `NOT IN CONTROL`, its artboard is inert, its **Take control** action
  cannot force handover, and its STOP remains available;
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

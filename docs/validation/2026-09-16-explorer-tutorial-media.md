# Explorer Tutorial Media Validation

Date: 2026-09-16

Reproducible browser evidence for the README's Extender tutorial. This is ROS-bench validation without a physical
robot, target tablet, gamepad, or assistive switch.

## Live Stack

- Existing `cartesian_manager_node` with the installed Explorer parameters and live ROS topic publishers.
- An isolated `bloom api run-ros` process on port `8001`, using a temporary SQLite store populated from the committed
  seeds and Explorer's `base_link,ft_frame,hybrid_frame` allowlist.
- An isolated Vite process on port `5181`, proxying HTTP and WebSocket traffic to that API.
- Chromium at `1280x720`; no HTTP, ROS, runtime-client, or telemetry mocks.

Starting the isolated API after a clean dependency sync exposed that bare Uvicorn had no WebSocket protocol
implementation. `websockets` is now an explicit backend dependency; the fresh runtime then reached `READY` over its
real `/api/v1/runtime/ws` connection.

## Artifacts

- `docs/assets/screenshots/11-joystick-lab.png`: fresh `1280x720` Explorer Joystick Lab capture.
- `docs/assets/demo/bloom-explorer-demo.mp4`: H.264/yuv420p, `1280x720`, 114.92 seconds, 1,262,370 bytes.

The walkthrough opens Explorer Drive, sends and releases a keyboard translation command, selects the supported Hybrid
frame in Joystick Lab, then visits Robot feedback, Command sources, and Bloom Debug. Debug refreshes the live ROS topic
catalog, receives one manager-output sample from a second Explorer browser client, and refreshes the runtime audit
before holding on the resulting X-velocity transient. The audit contains accepted commands from the recorded session.
Tool remains visible but unavailable because this Explorer deployment does not report `effector_frame`.

The recording also exposed Bloom Debug wrapping its three status sections into two rows at `1280x720`, shrinking the
configured plot surface. The diagnostic strip now uses three columns; a second selector smoke and sampled video frames
confirmed readable audit and plot surfaces. Shutdown logs also exposed Bloom Debug subscribing to
`/joystick_cartesian_command` with the legacy `extender_msgs/msg/TeleopCommand` type. The tracked seed now uses the
`geometry_msgs/msg/TwistStamped` type published by the default `cartesian_manager` backend, with a seed contract test
covering Bloom Debug and both Manager apps. Its plot buffer now retains 3,000 samples so the declared 30-second window
also survives a 100 Hz command stream.

## Reproduction

With a seeded ROS-enabled Explorer API and its dashboard already running:

> [!NOTE]
> `npm run record:explorer-demo` and its script were removed on 2026-09-17, once the screens it navigated by name had
> been renamed. `npm run record:demo` records the current walkthrough. The commands below are kept as the record of how
> this evidence was produced.

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 \
  node scripts/ros-e2e-capture.mjs --only 11-joystick-lab --out docs/assets/screenshots

BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 npm run record:explorer-demo
```

For a quick selector and transition check before a full take:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 \
BLOOM_DEMO_DURATION_MS=0 \
BLOOM_DEMO_PAUSE_SCALE=0.05 \
npm run record:explorer-demo -- --out /tmp/bloom-explorer-demo-smoke.mp4
```

`ffprobe` verified codec, pixel format, dimensions, duration, and size. Contact-sheet frames sampled throughout the
video, the live X-velocity transient, and a final full-size frame were inspected for blank output, clipping, stale
overlays, and unreadable debug content.

## Remaining Acceptance

- Repeat the tutorial on Explorer and Kinova hardware under the normal lab safety procedure.
- Validate the intended tablet, gamepad, switch, and operator profiles with Robin.
- Confirm every offered frame against each manager's live configuration before participant use.

## Amended 2026-09-25: the 3D robot view captures

`docs/assets/screenshots/runtime-robot-3d-view.png` (Bloom Debug's Robot view) and
`runtime-widget-lab-robot.png` (Widget Lab's Robot screen) are the two README images that cannot be taken from
the mocked dashboard: the 3D view draws the robot the API serves, so without a running robot it shows its note
instead of a scene. Both were captured at 1920x1080 against the live Kinova simulation
(`cartesian_manager kinova.launch.py use_simulation:=true`), with the Widget Lab probe publishing its markers,
a second node publishing a goal, a path and a label on `/goal_markers`, and the arm folded out of its upright
start first so the pose reads. `npm run capture:readme` leaves both alone, since it runs without ROS.

Taking them found a defect: a marker that gives a colour per point was hidden when its own `color.a` was unset,
where rviz draws it because `colors` overrides `color`. Fixed, with a test, before the capture was kept.

## Amended 2026-09-25: the README set, recaptured against live robots

The README now opens with the Bloom logo and presents the product for someone meeting it for the first time: the
Builder, the roles, the devices, the 3D view and the apps that ship. Every screenshot was recaptured with
`npm run capture:readme` against a dashboard whose API ran `api run-ros` beside the Explorer simulation, and the
Kinova Manager image beside the Kinova simulation, so no control reads as unavailable. Five images are new:
`builder-inspector` (the gripper toggle's topic and payloads on Explorer Manager's operator Drive),
`runtime-explorer-drive-bench` and `runtime-explorer-one-switch` (the same Drive in two more roles), and
`runtime-supervisor`.

Recapturing found three things. The capture script's own guard had refused to run since the `allowed_parameters`
policy field was added, because it filled in every API default but that one. The runtime library still said
"Choosing is deliberate" after roles gained a default. And the one-switch pads printed their readout as
`x 0.00y 0.00`, which a screen reader also heard run together. All three are fixed.

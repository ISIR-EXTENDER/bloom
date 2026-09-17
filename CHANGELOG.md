# Changelog

All notable changes to Bloom are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
Bloom aims at [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the version stays `0.x`, breaking changes may land in a minor release, and each
one is called out under **Changed** with its migration note.

Detailed rationale for architectural choices lives in [docs/decisions](docs/decisions).

## [Unreleased]

### Added

- **Bloom as the active Extender IHM.** `extender_ui` is now documented as legacy reference/rollback software; open
  design and live-acceptance work is tracked in the UX handoff rather than an indefinite migration percentage.
- **Kiosk runtime shell** with a 44 px operating bar, truthful app/robot/link/frame/profile context, a 1.5 second hold
  before maintenance actions, and screen switching outside the primary operating surface.
- **Backend-latched runtime STOP** with immediate stop activation, cross-client state, and a one-second hold to resume.
- **Accessible input paths** for keyboard joysticks, step controls, latch, switch-scanning focus, dwell activation,
  browser gamepads, profile-level dead zone/repeat guard, large targets, and optional audio state cues. Browser
  `prefers-reduced-motion` is honored; the profile enum is not yet an independent motion switch.
- **Operator-owned runtime settings and language** with persistent per-profile overrides, local-only movement preview,
  scanning/dwell support, and complete English, Spanish, and French runtime-shell catalogs.
- **Action-based guided review** with a structurally local-only five-step runtime practice path and a six-check Builder
  review derived from saved app geometry, touch bounds, frame, topic policy, profile preview, and JSON export.
- **Read-only supervisor mirror** with stable per-app routes, live robot/frame/STOP/topic status, explicit operator
  ownership, and a runtime client projection that exposes no movement, STOP, resume, publish, or action methods.
- **Same-Wi-Fi development access** with a wildcard frontend bind, a printed LAN URL, an API-port-aware Vite proxy, and
  documented shared-SQLite, firewall, concurrency, and trusted-network constraints.
- **Explorer tutorial media** with a live Joystick Lab screenshot and a reproducible 1:55 ROS-bench walkthrough through
  Drive, Joystick Lab, feedback, command sources, and Bloom Debug.
- **One Cartesian command frame per application**, selected from backend capabilities, shown in the kiosk bar, applied
  to virtual controls and gamepads, persisted through JSON/SQLite, and checked against the deployment allowlist.
- **Kinova Manager app** alongside Explorer Manager, including manager drive, saved positions, feedback, command-source
  visibility, gripper controls, and Trigger-style fault reset.
- **Application lifecycle** (`active` / `archived`). Petanque is archived: kept
  and runnable, but not maintained against the current architecture and not a
  release gate. See decision 0121.
- **`npm run qa:review`**, a sweep for gaps the test suites cannot see: dead
  exports, ungated fixtures, duplicated storage keys, misplaced shebangs, and
  committed build caches.
- **Saved position library** with export of the `joint_targets` block for
  `cartesian_manager`, since Bloom cannot register a target on the manager at
  runtime.
- **Camera frames published to ROS** as `sensor_msgs/msg/CompressedImage`, with
  size, format and allowlist checks, rate limiting, and audit.
- **Gripper and digital-output semantics** matching `tablet_interface`, so a
  calibration lives in one place instead of in every screen.
- **Manipulability** from `/ee_jac`, which was published and entirely unused.
- **Per-axis teleop composition**: a full 6-DoF twist assembled from several
  widgets, matching `joystick_mapper` including its per-axis scaled dead zone,
  and local B1/B2 axis map swapping.
- **Plot freeze**, so a transient can be read instead of scrolling away.
- **`npm run check:version`**, because three files carried the version
  independently with nothing enforcing that they agree.
- **Explorer Manager app**, with screens following the manager's own branches:
  Drive, Positions, Robot feedback, and Command sources.
- `confirm_press` on command buttons: armed first press, dispatching second
  press, and a timeout that disarms. Defaults to off.
- `scripts/capture_joint_target.py` in `extender_workspace`, which captures a
  named pose from the live robot and emits a valid `joint_targets` block.
- `RclpyCartesianManagerGateway`, publishing `geometry_msgs/TwistStamped`
  Cartesian commands for the `cartesian_manager` control stack.
- `BLOOM_ROS_COMMAND_BACKEND` (`cartesian_manager` by default, `teleop_command`
  for the legacy path) and `BLOOM_ROS_COMMAND_FRAME_ID`.
- Mode-request validation against the `cartesian_manager` grammar, applied at the
  single publish choke point and reported as HTTP 422 with a readable message.
- This changelog, and a release checklist in
  [docs/release-checklist.md](docs/release-checklist.md).
- **Observer role.** `BLOOM_OBSERVER_API_KEY` authenticates a supervisor that may read apps, runtime state, the STOP
  latch, the audit log, saved positions and the topic catalog, and watch the runtime socket, but never claim control
  or send teleop.
- **Dashboard API key.** `VITE_BLOOM_API_KEY` is sent as `X-Bloom-API-Key` on HTTP calls and offered to the runtime
  socket as a `bloom.api-key.<key>` subprotocol, so the dashboard reaches an authenticated backend.
- **`npm run verify`** runs what CI runs, in CI's order. **`npm run check:contracts`** runs the version check and every
  app contract validation, in CI and in `verify`.
- `bloom config status` reports `outdated` for an unedited copy behind the shipped version and `deleted` for a shipped
  app removed on purpose.

### Changed

- **Breaking for ROS deployments.** The default teleop target moved from
  `/teleop_cmd` to `/joystick_cartesian_command`. `/teleop_cmd` remains
  allowlisted, so an existing deployment can pin the old behaviour with
  `BLOOM_ROS_COMMAND_BACKEND=teleop_command`.
- Mode requests are published in canonical form. `GEOMETRIC/Snake` now reaches
  ROS as `geometric/snake`.
- Runtime operation no longer exposes product navigation or editing shortcuts directly. Those actions now require the
  maintenance hold.
- Sandbox V0.0 and Explorer user-test configurations target the manager
  contract. Petanque deliberately stays on `/teleop_cmd`.
- Robot feedback topics moved from `/sandbox_controller/*` to `/ee_pose`,
  `/ee_velocity` and `/joint_states`.
- Documentation now describes the Ubuntu 24.04 and ROS 2 Jazzy baseline.
- **Breaking for development machines.** Node.js 24.15.0 or later is required, pinned in `.nvmrc`. `npm run verify`
  refuses an older Node; the Extender launcher only warns. The README gives the upgrade commands.
- **Breaking for ROS deployments.** The command frame allowlist defaults to `base_link` and `hybrid_frame`, the frames
  every `cartesian_manager` config has. Set `BLOOM_ROS_EE_FRAME_ID` to the robot's tool frame (`ft_frame` on Explorer,
  `effector_frame` on the Kinova gen3) to offer it again, or set `BLOOM_ALLOWED_COMMAND_FRAME_IDS` explicitly.
- **Breaking for API clients.** Runtime control ownership is on by default (`BLOOM_RUNTIME_CONTROL_REQUIRED=true`). One
  runtime socket claims control at a time, and robot-facing HTTP routes need its session id in
  `X-Bloom-Runtime-Session`. STOP stays open to any operator.
- **Breaking for API clients.** Saved positions belong to one application, selected with `config_id` and `app_id`.
  Saving needs that application to exist; unscoped calls keep their own library.
- **Breaking for lab launchers.** The runtime socket refuses a browser page whose `Origin` is not in
  `BLOOM_CORS_ALLOWED_ORIGINS`. The Extender launcher adds its own frontend and same-Wi-Fi origins; any other launcher
  must list them.
- Seeded apps now follow the shipped version. An unedited copy is upgraded at startup, including copies seeded before
  this release; an edited copy is kept. A shipped app deleted on purpose stays deleted until
  `bloom config seed --force <id>`.
- The Kinova gripper toggles send the Robotiq 85 range (`0.0` open, `0.8` closed) instead of Explorer's values.
- Moving teleop is capped at 60 commands per second per target (`BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND`).
- The SQLite store migrates to schema version 6, which records deleted configurations.
- The audit log counts identical records back to back in a `repeats` field instead of storing each one.

### Security

- Production refuses API keys shorter than 32 characters, a key shared by two roles, and a `*` CORS origin.
- The runtime socket checks `Origin`, so a web page in a browser that can reach the API can no longer claim control.
- The audit log lists sessions by alias. A session id proves ownership, and any reader could previously replay the
  owner's.
- The runtime socket key no longer travels in the query string by default, and Bloom redacts `api_key` values from
  Uvicorn's log lines.
- STOP is exempt from the HTTP rate limit, so it cannot be refused with 429.

### Fixed

- Fresh API environments now install a WebSocket implementation for Uvicorn, so runtime sessions still connect after
  `uv sync` or a clean deployment.
- Bloom Debug keeps preflight, topic, and audit status in one row at the maintained video viewport, leaving its live
  echo and plot widgets readable at `1280x720`.
- Bloom Debug subscribes to the default `cartesian_manager` command topic as `geometry_msgs/msg/TwistStamped`, matching
  the publisher instead of leaving the command echo empty with an incompatible legacy message type; its command plot
  also retains the full 30-second window at 100 Hz.
- Three high severity advisories in transitive frontend dependencies (`nanoid`,
  `postcss`, `undici`).
- The backend audit gate reported `pip`'s own advisory through `pip-audit`;
  `pip` is now constrained to a patched release rather than the finding being
  suppressed.
- Operator seed layouts are checked for canvas bounds and overlapping interactive controls; the Explorer/Kinova
  gripper payloads and speed topics now match their live client contracts.
- Explorer and Kinova command-source event logs now read `/mode_request` instead of rendering permanently empty, and
  local `teleop-frame` controls are no longer misreported as missing ROS topic destinations.
- Held values on stepped, latched and non-releasing controls expire after 15 s even while the screen re-renders, and
  return to rest after STOP, a lost connection or a screen change. A latched momentary button publishes its release
  when it unmounts or is disabled.
- Losing control ownership suspends teleop, so a reclaimed session no longer streams a joystick already released.
- A dwell that started on STOP can no longer complete as Resume, and switch scanning and dwell stay off the controls
  behind the Maintenance dialog.
- A ROS service call no longer holds the STOP lock, so STOP answers during a slow call.
- Camera frames are refused while STOP is engaged, and on the legacy `teleop_command` backend STOP zeros `/teleop_cmd`.
- Keyboard nudges on return-to-center sliders last only while the key is down; Home and End no longer jump to full
  scale.
- The supervisor mirror shows STOP, mode requests from the shipped buttons and an idle operator's frame correctly.
- The dashboard's runtime client matches each reply to its own request, and a late close from a replaced socket no
  longer tears down the new one.
- Configuration store: concurrent saves to one configuration no longer lose an edit, CLI commands adopt the old file
  store before writing SQLite, `config status` reports every app, and publishing an unedited app leaves its seed file
  untouched.
- Builder: JSON settings keep half-typed text, an emptied optional number is unset, and a slider step of 0 is refused.
- The Extender launcher no longer leaves Vite running when it exits, and Vite no longer drifts to another port.

### Known limitations

- Live validation on Extender hardware is still pending. Everything recorded so
  far is fixture, contract, or bench validation against a running
  `cartesian_manager` without a robot attached.
- Bloom applies no scaling to commands, by design. See decision 0118.
- Kinova Manager has no **Go home** button. `cartesian_manager`'s Kinova parameters define `home` over six joints with Explorer's angles, and joint 4 at 2.97 rad is outside the gen3 limit of 2.57 rad. The button returns once that target is corrected upstream.
- `cartesian_manager` still does not publish authoritative active-mode feedback; Bloom labels the mode as last requested.
- Directional switch scanning and combined scan-plus-dwell are covered by component, app, and bench-browser evidence,
  but still require validation with the intended physical switch and operators before participant use.

## [0.1.0]

Initial foundation: builder, runtime, widget contracts, configuration storage
with JSON and SQLite, runtime sessions with audit and rate limiting, ROS
adapters, design system, and the CI baseline. See
[the documentation map](docs/README.md) and dated decision/validation records for how this was assembled.

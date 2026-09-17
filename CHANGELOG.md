# Changelog

All notable changes to Bloom are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
Bloom aims at [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the version stays `0.x`, breaking changes may land in a minor release, and each
one is called out under **Changed** with its migration note.

Detailed rationale for architectural choices lives in [docs/decisions](docs/decisions).

## [Unreleased]

### Changed

- A control lease now holds only while its session is still talking (decision 0135). An owner silent for 10 s can be
  displaced by another operator's **Take control**, so a tablet that lost Wi-Fi with its socket still open no longer
  blocks every other operator and every resume. Runtime tabs ping every 3 s, so an idle operator is never displaced.

### Fixed

- **STOP is the first scan target** of every cycle, on every surface that draws it. It used to sit last in the screen's
  DOM order, 28 s away at a 1400 ms scan period.
- An application's `allowed_teleop_targets` is enforced on the runtime socket. A tab names its app with a new
  `app_context` message, and teleop, publishes and service calls are then limited to the deployment allowlists
  intersected with that app's `runtime_policy`, as `POST /runtime/actions` already did. A session on Bloom Debug or the
  webcam visualizer, which declare no teleop target, can no longer stream teleop. A client that sends no app context
  keeps today's deployment-wide behaviour.
- The runtime socket serves at most 32 sessions. A connection past that is refused with `session_limit` and closed
  instead of adding another session, each of which could hold 64 ROS subscriptions.
- Rate-limit state is bounded. A camera frame is checked against the publish allowlist before it is counted, so an
  arbitrary topic no longer leaves a counter behind, and idle runtime keys, client-address buckets, and
  per-configuration save locks are released instead of kept for the life of the process.
- A service call the robot refused is audited as `rejected`, not `accepted`, and every service audit row carries the
  receipt's own `call_status` and `success`, so a simulated call is visible as one.
- A camera frame published with no ROS attached is reported as `simulated`, like every other Noop seam, instead of
  `published`. `GET /api/v1/capabilities` now also reports the `camera-frames` seam, so a screen can tell whether
  frames reach ROS.
- A configuration read no longer takes a write lock. The store is migrated once, when its repository is built, and
  connections run in WAL with a 15 s busy timeout, so a CLI `config seed` holding a write no longer makes the API
  answer 500 with `database is locked`.
- **Scanning stays on while stopped**, with the resume control as its only target, and a switch press on it resumes. A

- **A visible keyboard focus ring.** The shipped ring was a 28% primary tint, 1.59:1 on the cream surface. It is now a
- **Dwell requires a rest, not a passage.** Moving more than a few pixels inside a control restarts its dwell, so
- **Maintenance is reachable under scanning.** The **⋯** button is part of the scan set and its activation opens the

## [0.2.0] - 2026-09-17

### Added

- **`npm run e2e:sim -- --robot explorer|kinova`** drives Bloom against the Explorer Gazebo simulation or Kinova fake
  hardware, with no mocks, and checks each effect on the ROS graph: motion, release to zero, Bench and Operator parity,
  gripper values, speed limits, STOP, the maintenance hold, the frame stamp, Go home and Release, and live samples in
  Robot feedback and Bloom Debug. See [the simulation run](docs/validation/ros-sim-e2e.md).
- **A five-minute walkthrough** (`docs/assets/demo/bloom-demo.mp4`) recorded against the Explorer simulation with a
  visible cursor, reproducible with `npm run record:demo`.
- **`unsubscribe_topic`** on the runtime socket (decision 0134): a screen change releases the topics the new screen does
  not show, and one subscription per topic serves every screen.
- A **NOT IN CONTROL** status chip while another session owns the robot, and a **Discard changes** action in Settings.
- The plot board's y range widens to fit its data (`y_fit_data`, on by default), and value strip and picker readings
  dim as stale after 3 s without a sample.

- **The 2026-09-17 design handoff** (tracked in `docs/design/`, plan in `docs/design/implementation-plan.md`):
  - Widget cards follow the design anatomy: control surfaces, info cards, bare grouped buttons, and action cards.
    Pads share one geometry recipe, speed limits can render as **Slow / Medium / Fast** segments, and command buttons
    take an optional `hint`.
  - A widget minimum-size contract (decision 0132). An undersized card grows rather than clips, and streams (echo,
    event log, position library) scroll inside their authored height.
  - **Reserved regions** on screens: rectangles the runtime owns, such as `stop` and `debug-status`, which no widget
    may overlap.
  - Widget kinds `plot-board`, `plot-picker`, and `value-strip` for multi-series telemetry, with one subscription per
    topic, per-profile picker selections, and a Command sources verdict of who is driving.
  - Widget kinds `joint-table` and `jacobian`. They read "not reported" when joint limits or the Jacobian are missing,
    and manipulability compares against this session's best rather than a guessed threshold.
  - Profiles name the screen a role opens on with `preferred_control_layout_id` (decision 0133). Roles switch through
    the maintenance sheet with their own 1.5 second hold.
  - A kiosk bar with screen title, status chip, frame, publish rate, and role pill, and a maintenance sheet with
    read-only facts and grouped actions.
  - A list runtime library with a role rail, derived device badges, and the supervisor mirror as a secondary action.
  - Bloom Debug on a 1920×1080 desktop panel with status cards, a plot board and picker, the joint table, the Jacobian,
    the raw echo, and the Kinova fault state.
  - Builder: panel-true canvas, drawn reserved regions, **Too small** tags, a `W×H · N px glass` chip measured at the
    class's smallest panel, a one-tap **Resize to W×H**, and review checks for minimum size, sibling symmetry, pad
    pairs, and profile coverage.
  - A new landing page, and operator widget words (speeds, shaping modes, turns, gripper verbs, directions) shown in
    Spanish and French from a glossary. ES STOP reads **PARADA**. Both still need a native speaker's review.

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

- **Breaking for API clients.** The runtime socket keys topic subscriptions by widget id and topic, and a frontend with
  this release sends `unsubscribe_topic`, which an older API refuses. Deploy the API and dashboard together.
- STOP stays live over Settings and the practice tour, drawn as a full-height rail those views keep clear.
- Reloading a runtime app returns to the same app and screen instead of the first app of the first configuration.
- Plot samples are timed by the browser that received them, so a tablet clock ahead of the robot PC no longer empties
  the plot or the Command sources verdict, which now reads the whole twist rather than one field.
- The builder snaps a refused drag or resize back to where it started, refuses a resize, duplicate or new widget that
  would reach a reserved region, adds palette widgets at their kind's minimum, starts new tablet screens on the
  1280×720 panel, and floors glass sizes so a target under 44 px fails.
- The remaining shipped operator vocabulary, screen titles and role names follow the profile's language, frames a robot
  never offers are drawn as unsupported, and speed readouts drop a trailing zero.

- **Breaking for app authors.** The Manager apps' `manager_drive` screen is split into `manager_drive_bench` and
  `manager_drive_operator`. Both send identical messages for the same gesture; the profile picks which one opens.
- **Breaking for app authors.** Toggle `onLabel`/`offLabel` are verbs for what the button will do (**Close gripper**),
  and the commanded state moved to `onStateLabel`/`offStateLabel` in the card header.
- **Breaking for API clients.** Widget kinds `plot-board`, `plot-picker`, `value-strip`, `joint-table`, and `jacobian`
  exist, and screens carry `reserved_regions`. The backend refuses a widget overlapping a region. The SQLite store
  migrates to schema version 7 and backfills regions from each stored bundle.
- **Breaking for operators.** The runtime library has no **Auto** profile. A remembered role is preselected but never
  opens by itself, and a stored `Auto` reads as no role remembered.
- **Breaking for operators.** The command frame left Runtime Settings and per-profile overrides; a stored frame
  override is ignored and removed. Choose the frame on the Joystick Lab frame row.
- Runtime Settings keeps a draft until **Save and resume**; Escape discards it. Text size is editable, and step and
  latch appear as **How a push moves** beside the input method.
- The horizontal Pivot slider publishes with `scale: -1`, so its left end turns the hand left (`+angular.z`). This is
  verified on the ROS wire, not yet on hardware.
- Kinova speed segments are 0.025 / 0.05 / 0.10 m/s, inside the gen3's 0.1 m/s; Explorer keeps 0.08 / 0.15 / 0.30.
- STOP draws in the screen's `stop` region and stays above the maintenance scrim; the sheet is inset clear of it.
- A full-panel screen scales its 1280×676 body with the bar, so widgets render at 1.0 on a 1280×720 panel.
- The kiosk bar no longer shows the robot name; the supervisor mirror still does.

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

- Drive · Bench's continuous speed limits had a 40 px thumb, 32 px on the tablet glass, so the shipped apps failed the
  builder's own touch floor. The thumb is 56 px and the two cards are authored 132 tall to keep the rail's spacing.

- Bloom Debug's joint table waited forever on the Explorer simulation: NaN velocity and effort on the passive gripper
  joints made every `/joint_states` sample invalid JSON. Non-finite values are sent as `null`.
- Moving between screens stacked subscriptions, so plots received each message twice; a 100 Hz topic kept only 9 s of a
  30 s window; the newest sample drew past the plot's right edge; and manipulability near 8e-5 read `0.000`.
- Plot pickers and the joint table grew past their slot, under STOP on Kinova's Robot feedback and off a 1080 px screen
  in Bloom Debug; they now scroll. Bloom Debug's raw echo is raised to its minimum, and a test keeps every Manager and
  Bloom Debug widget at or above its kind's minimum.
- Spanish and French labels no longer clip or run under a knob: speed segments, group labels, pad and pivot words wrap.
- The maintenance sheet keeps **Resume operating** on screen, the **⋯** hold button stays inside the bar, Settings fits
  1280×720 beside STOP, speed-limit thumbs meet the 48 px bench floor, and the reserved STOP rect follows the canvas
  after Settings closes.
- Keyboard holds cancel when focus leaves; a toggle whose label is a verb no longer announces itself as pressed.
- The publish-rate fact no longer claims zeros are sent at rest, the Settings try-it heading says nothing is sent, and
  a zero dead zone reads as each control's own rather than `0.00`.
- Builder: an empty screen invites widgets instead of promising a migration, the inspector keeps the selected widget's
  size in view, labels lose the kind badge that covered them, stray TOO SMALL tags stay in their row, and counts say
  "1 screen".
- The landing page no longer draws a focus ring around the page on load, and the library remembers the last app once
  its configuration loads, keeps its device note in step with the window, and closes its menu on Escape.

- A joystick held under the maintenance sheet, Settings, or the practice tour no longer resumes motion after the
  zero. Only releases pass while motion is held.
- Builder home previews place widgets against the screen's own canvas rather than a desktop one.
- A busy stream card no longer grows under STOP, and the Height slider's direction words are centred over the pad.

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

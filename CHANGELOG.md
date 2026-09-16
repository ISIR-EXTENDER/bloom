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

### Fixed

- Three high severity advisories in transitive frontend dependencies (`nanoid`,
  `postcss`, `undici`).
- The backend audit gate reported `pip`'s own advisory through `pip-audit`;
  `pip` is now constrained to a patched release rather than the finding being
  suppressed.
- Operator seed layouts are checked for canvas bounds and overlapping interactive controls; the Explorer/Kinova
  gripper payloads and speed topics now match their live client contracts.
- Explorer and Kinova command-source event logs now read `/mode_request` instead of rendering permanently empty, and
  local `teleop-frame` controls are no longer misreported as missing ROS topic destinations.

### Known limitations

- Live validation on Extender hardware is still pending. Everything recorded so
  far is fixture, contract, or bench validation against a running
  `cartesian_manager` without a robot attached.
- Bloom applies no scaling to commands, by design. See decision 0118.
- `cartesian_manager` still does not publish authoritative active-mode feedback; Bloom labels the mode as last requested.
- Directional switch scanning and combined scan-plus-dwell are covered by component, app, and bench-browser evidence,
  but still require validation with the intended physical switch and operators before participant use.

## [0.1.0]

Initial foundation: builder, runtime, widget contracts, configuration storage
with JSON and SQLite, runtime sessions with audit and rate limiting, ROS
adapters, design system, and the CI baseline. See
[the documentation map](docs/README.md) and dated decision/validation records for how this was assembled.

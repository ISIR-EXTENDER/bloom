# Changelog

All notable changes to Bloom are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
Bloom aims at [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the version stays `0.x`, breaking changes may land in a minor release, and each
one is called out under **Changed** with its migration note.

Detailed rationale for architectural choices lives in [docs/decisions](docs/decisions).

## [Unreleased]

### Added

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

### Known limitations

- Live validation on Extender hardware is still pending. Everything recorded so
  far is fixture, contract, or bench validation against a running
  `cartesian_manager` without a robot attached.
- One low severity `esbuild` advisory remains. It affects the development server
  on Windows only, which Bloom does not target.
- Bloom applies no scaling to commands, by design. See decision 0118.

## [0.1.0]

Initial foundation: builder, runtime, widget contracts, configuration storage
with JSON and SQLite, runtime sessions with audit and rate limiting, ROS
adapters, design system, and the CI baseline. See
[docs/migration-plan.md](docs/migration-plan.md) for how this was assembled.

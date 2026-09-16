# Production Readiness Review

Last reviewed: 2026-09-16.

Bloom is the active Extender IHM. `extender_ui` is legacy reference/rollback software; readiness work below improves and
validates Bloom rather than deciding which product owns the IHM.

## Current Readiness

| Area | Current Bloom state | Remaining evidence or work |
| --- | --- | --- |
| Product shell | Builder, app library, Help, history-aware routes, and kiosk runtime. | Role-aware first entry and operator onboarding. |
| Runtime safety surface | Truthful kiosk status, fixed backend-latched STOP, held resume, held maintenance entry. | Full controller/hardware STOP acceptance. |
| App/screen configuration | API-backed flows, shared seeds, SQLite normalized reconstruction, screen library, drag/drop with button fallbacks. | Generic collision feedback and multi-device touch review. |
| WYSIWYG builder | Save/discard, undo/redo, palette, inspector, previews, target-size warning. | Whole-screen device frames and a policy for fit below physical target size. |
| Operator controls | Two joysticks, Z/RZ, per-axis composition/dead zone, mode/gripper/speed commands, saved positions, service calls. | Live Explorer/Kinova acceptance in every offered frame. |
| Accessible input | Keyboard, large/assisted targets, directional scanning with optional dwell confirmation, step, latch, gamepad, audio, conditioning, and browser reduced-motion handling. | Wire the reduced-motion profile; complete settings and operator/device validation. |
| Feedback/debug | Topic catalog, echo, plots/freeze, command sources, manipulability, audit, simulated or opt-in rosbag recording. | Live recording and visual-servoing sessions. |
| Camera | Browser webcam/stream and validated `CompressedImage` publishing. | Permission/recovery UX and live camera/tag validation. |
| ROS boundary | `cartesian_manager` default, legacy gateway fallback, allowlists, frame policy, mode validation, rate limits, audit. | Robot profile, authoritative mode feedback, live robot sign-off. |
| Security | API keys, roles, production fail-closed settings, CORS, command policies, audits, dynamic smoke. | Deployment-specific secrets/origins and shared-lab operational review. |
| Petanque | Archived Bloom app, fixture/parity checks, legacy `/teleop_cmd` path retained. | Deliberate maintain/validate/retire decision if Petanque is still required. |

Repository, browser, contract, and `cartesian_manager` bench gates are accepted. Target-tablet, assistive-device, live
robot, and operator acceptance remains pending where listed. Those are different evidence levels, not percentages.

## What Bloom Preserved

From `extender_ui`:

- one canonical app/screen/widget configuration shared by builder and runtime;
- WYSIWYG geometry, drag/resize, reusable screens, and JSON migration fixtures;
- tactile pointer-native joysticks, large sliders, direction/readout feedback, and return-to-center teleop controls;
- configurable camera/stream and generic display/debug widgets;
- app-specific behavior expressed as reusable primitives or explicit app configuration rather than core forks.

From `tablet_interface` and `input_interfaces`:

- validated WebSocket/runtime payloads and zero-on-release behavior;
- per-axis scaled dead zones and local B1/B2 axis-map parity;
- concrete gripper payloads, typed topic publishing, and manager mode grammar;
- optional ROS gateways behind an injectable backend boundary;
- command freshness, allowlists, rate limits, and audit at the server edge.

Preserving those contracts does not make either legacy UI the current product. New IHM behavior, configuration, and
design work belongs in Bloom.

## Architecture Status

The durable boundaries are in place:

- generic frontend/backend libraries do not import ROS;
- runtime widgets emit intents and normalized input contributions;
- app policy is an early guardrail and backend deployment policy is final;
- JSON is the interchange/shared-seed format and SQLite is runtime state;
- one effective session frame applies to every composed Cartesian input, with application policy as its default;
- input devices stay above the robot adapter boundary.

The main architecture gap is a robot profile. Extender topics, mode grammar, actuators, feedback topics, and frame sets
still exist in several constants. A second robot/non-ROS profile is the test that will show whether that abstraction is
real. See [the robot-agnostic note](architecture-robot-agnostic.md).

Maintainability risks remain in the large dashboard orchestration/test modules and centralized widget settings registry.
Split them when a concrete feature makes ownership unclear; they are not blockers for the current operator product.

## UX Status

The runtime now follows the strongest design-review requirements: no builder chrome under the operator's hand, a small
truthful bar, a real stop, direction words, one visible effective command frame, tested contrast, multiple input modes, and control
bounds in maintained seeds.

The next UX work is not another broad redesign. It is the unresolved physical and social layer:

- screen-space target guarantees after fit scaling;
- complete profile settings and safe preview;
- switch/gamepad/dwell validation with intended users;
- stable eyes-off control placement and non-visual cues;
- supervisor mirroring and explicit control ownership;
- role-aware onboarding and EN/ES/FR runtime language;
- camera and fault recovery language.

The tracked implementation matrix and backlog are in [the UX design handoff](ux-design-handoff.md).

## Release Position

Bloom releases may state that it is the active Extender IHM and that its automated/bench gates pass. They must also state
which target-device and live-robot paths have or have not been accepted.

Do not describe `extender_ui` as the current IHM. Do not delete or make it unavailable merely to make the documentation
look finished. Legacy cleanup has separate gates in [legacy-retirement-gates.md](legacy-retirement-gates.md), and live
evidence belongs in [extender-petanque-validation.md](extender-petanque-validation.md).

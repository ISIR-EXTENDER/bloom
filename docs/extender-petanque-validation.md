# Extender And Petanque End-To-End Validation

Bloom can only replace legacy workflows after the complete operator pipeline is validated with real configurations,
runtime adapters, and user-facing behavior. This document is the Phase 5 validation protocol.

## Validation Status

Status: in progress.

Current result: Bloom is ready for structured Extender/Petanque validation, but the legacy repos should not be marked
legacy yet. The remaining decision needs a real operator pass on the target tablet and robot/simulation stack.

Latest lab-entry record:
[2026-07-10 Extender lab preflight](validation/2026-07-10-extender-lab-preflight.md).

Latest Sandbox contract record:
[2026-07-10 Sandbox V0.0 runtime contract](validation/2026-07-10-sandbox-runtime-contract.md).

Latest Robin visual-servoing contract record:
[2026-07-10 Robin visual-servoing contract](validation/2026-07-10-robin-visual-servoing-contract.md).

## Preconditions

- Extender ROS workspace builds and sources cleanly.
- Bloom `main` is up to date.
- Validation configurations are present for `sandbox`, `bloom-debug`, and `petanque-admin`. Run
  `npm run validation:extender` to seed/check the local backend configuration directory from tracked fixtures.
- Phase 5 security checks pass:
  `npm run audit:security` and `npm run security:dynamic`.
- The target tablet mapping is documented and, if needed, applied through `scripts/extender-tablet-touch-map.sh`.
- Legacy `extender_ui` and `tablet_interface` remain available as rollback paths.

## Pending Acceptance Checks

These checks are still pending before any legacy retirement notice:

- Sandbox teleop lab: real operator pass on the target tablet against the sandbox simulation.
- Sandbox motion path: confirm `/teleop_cmd` reaches `/sandbox_controller/velocity_command` and visible robot motion.
- Sandbox scalar controls: confirm slider publishes are stable and audited during the same live session.
- Bloom Debug: confirm topic catalog, preflight statuses, topic echo/plot subscriptions, recording controls, and audit
  refresh against live ROS topics.
- Petanque candidate: confirm runtime app launch, teleop, camera/stream behavior, state-machine commands, gesture
  controls, and backend/app policy allowlists against the Petanque stack.
- Security/deployment: rerun dependency and dynamic security checks with the staging/shared-lab environment variables.
- Tablet UX: confirm `1024x600` and configured HD operation on the target tablet hardware or accepted equivalent.

The browser-only smoke checks below can support the PR, but they do not replace the live operator pass.

## Validation Helpers

Run the local preflight before a lab session:

```bash
npm run validation:extender
```

The helper seeds `backend/data/configurations` from tracked fixtures when needed, verifies the expected validation
apps/screens are present, and prints the exact runtime URL plus ROS commands to monitor during the session. Set
`BLOOM_REFRESH_VALIDATION_CONFIGS=1` to overwrite local validation copies from fixtures.

Run the browser-only visual smoke to catch layout and Bloom Debug regressions without ROS:

```bash
npm run visual:smoke
```

Run the Sandbox runtime contract check before the live sandbox simulation pass:

```bash
npm run validation:sandbox-runtime
```

Run the visual-servoing contract check before Robin's live camera/tag pass:

```bash
npm run validation:visual-servoing
```

## Local Smoke Sequence

1. Source/build Extender workspace:

   ```bash
   cd /home/susana/workspace/extender/extender_workspace
   source install/setup.bash
   ```

2. Start sandbox simulation:

   ```bash
   ros2 launch sandbox_controller explorer.launch.py use_simulation:=true
   ```

3. Start Bloom next to the workspace:

   ```bash
   cd /home/susana/workspace/extender/bloom
   scripts/extender-workspace-dev.sh
   ```

4. Open the Bloom runtime app library and validate:

   - `Sandbox teleop lab` opens without builder chrome.
   - Translation and rotation joystick gestures publish `/teleop_cmd`.
   - Bloom Debug or `GET /api/v1/ros/topics/status` shows publishers/subscribers for `/teleop_cmd`, `/joint_states`,
     and `/sandbox_controller/velocity_command`.
   - Robot motion is visible in RViz/Gazebo.
   - Scalar sliders publish expected values and do not jump unexpectedly.
   - Bloom Debug topic catalog loads.
   - Topic echo and plot widgets can subscribe to live topics.
   - Runtime audit records accepted and rejected commands.

If Bloom publishes `/teleop_cmd` but the robot does not move, isolate the issue with a direct ROS command before
debugging the web stack:

```bash
ros2 topic pub --times 12 --rate 10 /teleop_cmd extender_msgs/msg/TeleopCommand \
  "{twist: {linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}, mode: 3}"
```

Then monitor `/sandbox_controller/velocity_command`. If it also stays at zero, the current blocker is in the
ROS/simulation controller path rather than Bloom's runtime transport.

## Petanque Validation

Validate against the legacy Petanque flow before marking the Petanque UI path as covered:

- Petanque app opens from Bloom runtime library.
- Petanque teleop joysticks publish `/teleop_cmd` through the Bloom runtime adapter.
- Camera/stream widgets show the expected feed or a clear connection state.
- State-machine command buttons publish the configured command payloads.
- Petanque command topics pass both app-level runtime policy and backend runtime allowlists.
- Petanque gesture/trajectory controls emit the configured generic intents.
- Bloom Debug can inspect Petanque topics while the app runs.
- Legacy PlayPetanque behavior remains available until the Bloom flow is accepted.

## Tablet UX Acceptance

On the HMTECH tablet or equivalent target viewport:

- Main runtime controls remain visible at `1024x600` and configured `1920x1080`.
- Touch targets are large enough for joystick, slider, command, runtime navigation, and debug controls.
- Runtime is operator-clean by default; debug details stay hidden unless explicitly needed.
- Browser back/forward affordances do not create blank pages.
- Backend/robot status indicators are readable without becoming alarm-noisy.

## Security Acceptance

- Deployment-style run uses explicit CORS origins.
- API keys are enabled for staging/shared-lab checks.
- Unknown topics, message types, malformed payloads, and disallowed teleop targets are rejected.
- Rate-limited command bursts are rejected and audited.
- Dependency audits and dynamic security smoke pass before a deployment-oriented validation session.

## Acceptance Record

Use this table during validation sessions.

| Date | Environment | App | Result | Notes | Validator |
| --- | --- | --- | --- | --- | --- |
| 2026-06-29 | Local repo preflight | Sandbox teleop lab, Bloom Debug, Petanque admin | Pending live validation | Added `npm run validation:extender` fixture/config preflight; does not prove ROS motion or operator acceptance. | Codex |
| 2026-07-10 | Local Extender lab preflight | Sandbox V0.0, Bloom Debug, Petanque admin | Accepted for lab entry | Preflight passed, setup file found, validation configs present, and required ROS packages discovered. See [record](validation/2026-07-10-extender-lab-preflight.md). | Codex |
| 2026-07-10 | Fixture/runtime contract | Sandbox V0.0 | Accepted for fixture/runtime contract | Added `npm run validation:sandbox-runtime` for controls, topics, message types, monitor topics, and app policy. See [record](validation/2026-07-10-sandbox-runtime-contract.md). | Codex |
| 2026-07-10 | Fixture/runtime contract | Robin visual-servoing | Accepted for UI/ROS split contract | Added `npm run validation:visual-servoing` for webcam preview, AprilTag detection topics, visual-servoing velocity/error topics, and raw image exclusion from UI monitors. See [record](validation/2026-07-10-robin-visual-servoing-contract.md). | Codex |
| _pending_ | Sandbox simulation | Sandbox teleop lab | Pending | Needs operator pass. | _pending_ |
| _pending_ | Sandbox simulation | Bloom Debug | Pending | Needs live topic pass. | _pending_ |
| _pending_ | Petanque stack | Petanque candidate | Pending | Needs legacy parity pass. | _pending_ |

## Exit Criteria

Bloom can move toward legacy retirement only when:

- all required app workflows are accepted by the relevant users;
- rollback to legacy paths is documented;
- deployment/security settings are documented for the target environment;
- no high-severity UX issue blocks tablet operation;
- the team agrees which legacy packages are only legacy and which still own low-level behavior.

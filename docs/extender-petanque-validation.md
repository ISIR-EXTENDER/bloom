# Extender And Petanque End-To-End Validation

Bloom can only replace legacy workflows after the complete operator pipeline is validated with real configurations,
runtime adapters, and user-facing behavior. This document is the Phase 5 validation protocol.

## Validation Status

Status: in progress.

Current result: Bloom is ready for structured Extender/Petanque validation, but the legacy repos should not be marked
legacy yet. The remaining decision needs a real operator pass on the target tablet and robot/simulation stack.

## Preconditions

- Extender ROS workspace builds and sources cleanly.
- Bloom `main` is up to date.
- Phase 5 security checks pass:
  `npm run audit:security` and `npm run security:dynamic`.
- The target tablet mapping is documented and, if needed, applied through `scripts/extender-tablet-touch-map.sh`.
- Legacy `extender_ui` and `tablet_interface` remain available as rollback paths.

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
   - Robot motion is visible in RViz/Gazebo.
   - Scalar sliders publish expected values and do not jump unexpectedly.
   - Bloom Debug topic catalog loads.
   - Topic echo and plot widgets can subscribe to live topics.
   - Runtime audit records accepted and rejected commands.

## Petanque Validation

Validate against the legacy Petanque flow before marking the Petanque UI path as covered:

- Petanque app opens from Bloom runtime library.
- Camera/stream widgets show the expected feed or a clear connection state.
- State-machine command buttons publish the configured command payloads.
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

# Extender And Petanque End-To-End Validation

Bloom is the active Extender IHM. This document validates its complete operator pipeline with real configurations,
runtime adapters, target devices, and robot behavior. `extender_ui` remains a legacy reference/rollback while this live
evidence is completed.

## Validation Status

Status: in progress for live hardware/operator acceptance.

Current result: repository, browser, contract, and manager bench gates pass. Bloom is the current IHM, but the remaining
claims in this document still need operator passes on the target tablet and robot/simulation stack. No unrun live check
is implied by the product designation.

Latest kiosk/input/frame record:
[2026-09-16 kiosk, accessible input, and command frame](validation/2026-09-16-kiosk-accessible-input-and-command-frame.md).

Latest lab-entry record:
[2026-07-10 Extender lab preflight](validation/2026-07-10-extender-lab-preflight.md).

Latest Sandbox contract record:
[2026-07-10 Sandbox V0.0 runtime contract](validation/2026-07-10-sandbox-runtime-contract.md).

Latest Robin visual-servoing contract record:
[2026-07-10 Robin visual-servoing contract](validation/2026-07-10-robin-visual-servoing-contract.md).

Latest Sandbox tablet-layout record:
[2026-07-10 Sandbox V0.0 tablet layout](validation/2026-07-10-sandbox-tablet-layout.md).

Latest Petanque legacy parity record:
[2026-07-10 Petanque legacy parity contract](validation/2026-07-10-petanque-legacy-parity-contract.md).

Latest frontend/backend coherence record:
[2026-07-10 Frontend/backend coherence review](validation/2026-07-10-frontend-backend-coherence.md).

## Preconditions

- Extender ROS workspace builds and sources cleanly.
- Bloom `main` is up to date.
- Validation configurations are present for `sandbox`, `bloom-debug`, and `petanque-admin`. Run
  `npm run validation:extender` to seed/check the local backend configuration directory from tracked fixtures.
- Security checks pass:
  `npm run audit:security` and `npm run security:dynamic`.
- The target tablet mapping is documented and, if needed, applied through `scripts/extender-tablet-touch-map.sh`.
- Legacy `extender_ui` and the relevant `tablet_interface` path remain available for comparison/emergency rollback during
  the acceptance window.

## Pending Live Acceptance Checks

These checks are pending before Bloom's current robot-facing claims can be called live accepted and before legacy
fallbacks can be made unavailable:

- Sandbox teleop lab: real operator pass on the target tablet against the sandbox simulation.
- Sandbox motion path: confirm `/joystick_cartesian_command` reaches `/cartesian_command` and visible robot motion.
- Sandbox scalar controls: confirm slider publishes are stable and audited during the same live session.
- Bloom Debug: confirm topic catalog, preflight statuses, topic echo/plot subscriptions, recording controls, and audit
  refresh against live ROS topics.
- Archived Petanque app, only if the workflow remains required: confirm runtime launch, teleop, camera/stream behavior,
  state-machine commands, gesture controls, and backend/app policy allowlists against the Petanque stack.
- Security/deployment: rerun dependency and dynamic security checks with the staging/shared-lab environment variables.
- Tablet UX: confirm `1024x600`, `1280x720`, and the `1820x720` logical workspace on target hardware.
- Kiosk and STOP: confirm status/frame/profile readability, the 1.5 second maintenance hold, backend stop latching across
  clients, and the one-second resume hold against the real controller chain.
- Supervisor: confirm the read-only mirror is legible on the intended second display, reflects the same STOP latch and
  topic graph, states operator ownership, and cannot issue robot or stop/resume commands.
- Accessible input: validate each intended touch, keyboard, step, latch, scan, dwell, gamepad, and audio profile with
  the actual device and operator.

The browser-only smoke checks below can support the PR, but they do not replace the live operator pass.

## Validation Helpers

Run the local preflight before a lab session:

```bash
npm run validation:extender
```

The helper seeds `backend/data/configurations` from tracked fixtures when needed, verifies the expected validation
apps/screens are present, and prints the exact runtime URL plus ROS commands to monitor during the session. Set
`BLOOM_REFRESH_VALIDATION_CONFIGS=1` to overwrite local validation copies from fixtures.

Run the frontend/backend coherence check before launching local runtime apps:

```bash
npm run validation:frontend-backend
```

The helper verifies that app runtime policies agree with backend default publish, teleop, and recording allowlists.
To see which applications in your own store differ from the versions committed to the repository, run
`uv run python -m apps.bloom_cli.main config status` from `backend/`.

Run the browser-only visual smoke to catch layout and Bloom Debug regressions without ROS:

```bash
npm run visual:smoke
```

Run the Sandbox runtime contract check before the live sandbox simulation pass:

```bash
npm run validation:sandbox-runtime
```

Run the Sandbox tablet layout check after runtime layout or control sizing changes:

```bash
npm run validation:sandbox-tablet
```

Run the visual-servoing contract check before Robin's live camera/tag pass:

```bash
npm run validation:visual-servoing
```

Run the Petanque legacy parity contract check before the live Petanque stack pass:

```bash
npm run validation:petanque-parity
```

## Local Smoke Sequence

1. Source/build Extender workspace:

   ```bash
   cd /home/susana/workspace/extender/extender_workspace
   source install/setup.bash
   ```

2. Start sandbox simulation:

   ```bash
   ros2 launch cartesian_manager explorer.launch.py use_simulation:=true
   ```

3. Start Bloom next to the workspace:

   ```bash
   cd /home/susana/workspace/extender/bloom
   scripts/extender-workspace-dev.sh
   ```

4. Open the Bloom runtime app library and validate:

   - Explorer Manager or Kinova Manager opens as a kiosk without product or builder chrome.
   - The bar names the expected app, robot, effective command frame, profile, and link state.
   - Translation/rotation joysticks and Height/Pivot sliders compose all six axes on
     `/joystick_cartesian_command` and return to zero on release.
   - Joystick Lab changes to every supported command frame only at zero motion, keeps unsupported frames visible and
     disabled, updates the kiosk bar, and stamps the next virtual/gamepad command with the selected frame.
   - Neutral, Jaco, momentary Snake, gripper open/close, and speed limits publish their configured values.
   - STOP latches in the backend and resume requires a one-second hold.
   - A Supervisor mirror opened on a second display reflects STOP/topic state and contains no command controls.
   - Bloom Debug or `GET /api/v1/ros/topics/status` shows publishers/subscribers for
     `/joystick_cartesian_command`, `/cartesian_command`, `/joint_states`, and `/ee_velocity`.
   - Robot motion is visible in RViz/Gazebo.
   - Scalar sliders publish expected values and do not jump unexpectedly.
   - Bloom Debug topic catalog loads.
   - Topic echo and plot widgets can subscribe to live topics.
   - Runtime audit records accepted and rejected commands.

If Bloom publishes `/joystick_cartesian_command` but the robot does not move, isolate the issue with a direct ROS command before
debugging the web stack:

```bash
ros2 topic pub --times 12 --rate 10 /joystick_cartesian_command geometry_msgs/msg/TwistStamped \
  "{header: {frame_id: 'base_link'}, twist: {linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}}"
```

Then monitor `/cartesian_command`. If it also stays at zero, the current blocker is in the
ROS/simulation controller path rather than Bloom's runtime transport.

### Check the frame first

`cartesian_manager` accepts its configured base, end-effector, and hybrid frames and rotates angular commands from
the latter two using live robot poses. It performs no general TF lookup. An unknown `header.frame_id` is skipped, which
looks exactly like a broken web stack and is the fastest thing to rule out:

```bash
# the manager default and known frames
ros2 param get /cartesian_manager frames.default_input_frame_id
ros2 param get /cartesian_manager frames.base_frame
ros2 param get /cartesian_manager frames.ee_frame
ros2 param get /cartesian_manager frames.hybrid_frame

# what Bloom is stamping
echo $BLOOM_ROS_COMMAND_FRAME_ID

# Bloom's accepted set must match the deployment
echo $BLOOM_ALLOWED_COMMAND_FRAME_IDS
```

Also confirm the selected app's **Builder > App configuration > Adapter guardrails > Cartesian command frame** and the
value shown in the kiosk bar. The app value takes precedence over `BLOOM_ROS_COMMAND_FRAME_ID` as the session default.
Joystick Lab can select another reported frame while motion is zero; the new effective value applies to every virtual
and gamepad contribution. Bloom rejects a non-empty frame outside the deployment allowlist.

### Check the mode is understood

An unparseable mode string is dropped by the manager without feedback. Bloom validates before publishing, so an invalid
mode returns HTTP 422 rather than reaching ROS:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/ros/topics/publish \
  -H 'Content-Type: application/json' \
  -d '{"topic":"/mode_request","message_type":"std_msgs/msg/String","payload":{"data":"geometric/snake"}}'
```

## Petanque Validation

Validate against the legacy Petanque flow before marking the Petanque UI path as covered:

- `npm run validation:petanque-parity` passes against the tracked migrated fixture.
- Petanque app opens from Bloom runtime library.
- Petanque teleop joysticks publish `/teleop_cmd` through the Bloom runtime adapter. Petanque intentionally stays on
  the legacy path; only Sandbox and Explorer moved to `cartesian_manager`.
- Camera/stream widgets show the expected feed or a clear connection state.
- State-machine command buttons publish the configured command payloads.
- Petanque command topics pass both app-level runtime policy and backend runtime allowlists.
- Petanque gesture/trajectory controls emit the configured generic intents.
- Bloom Debug can inspect Petanque topics while the app runs.
- Legacy PlayPetanque behavior remains available until the Bloom flow is accepted.

## Tablet UX Acceptance

On the HMTECH tablet or equivalent target viewport:

- Main runtime controls remain visible at `1024x600`, `1280x720`, `1820x720`, and maintained desktop smoke viewports.
- Touch targets are large enough on glass for joystick, slider, command, STOP, and maintenance controls.
- Runtime is a kiosk by default; debug and editing actions stay behind the maintenance hold.
- The fixed STOP does not overlap app controls, and app controls do not overlap each other.
- The effective robot/frame/profile state remains readable without stealing the control area.
- Browser back/forward affordances do not create blank pages.
- Backend/robot status indicators are readable without becoming alarm-noisy.
- The supervisor mirror fits every status tile without horizontal scrolling or clipped text and remains visibly
  read-only.

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
| 2026-09-16 | Repository/CI contracts | Bloom kiosk, Manager virtual IHM, accessible inputs, app command frame | Accepted at repository level | Kiosk, STOP, 6-DoF composition, input modes, seed bounds, frame persistence/policy, full suites, and visual smoke passed; target hardware/operator acceptance remains pending. See [record](validation/2026-09-16-kiosk-accessible-input-and-command-frame.md). | Codex |
| 2026-06-29 | Local repo preflight | Sandbox teleop lab, Bloom Debug, Petanque admin | Pending live validation | Added `npm run validation:extender` fixture/config preflight; does not prove ROS motion or operator acceptance. | Codex |
| 2026-07-10 | Local Extender lab preflight | Sandbox V0.0, Bloom Debug, Petanque admin | Accepted for lab entry | Preflight passed, setup file found, validation configs present, and required ROS packages discovered. See [record](validation/2026-07-10-extender-lab-preflight.md). | Codex |
| 2026-07-10 | Fixture/runtime contract | Sandbox V0.0 | Accepted for fixture/runtime contract | Added `npm run validation:sandbox-runtime` for controls, topics, message types, monitor topics, and app policy. See [record](validation/2026-07-10-sandbox-runtime-contract.md). | Codex |
| 2026-07-10 | Fixture/runtime contract | Robin visual-servoing | Accepted for UI/ROS split contract | Added `npm run validation:visual-servoing` for webcam preview, AprilTag detection topics, visual-servoing velocity/error topics, and raw image exclusion from UI monitors. See [record](validation/2026-07-10-robin-visual-servoing-contract.md). | Codex |
| 2026-07-10 | Browser tablet layout | Sandbox V0.0 | Accepted for `1024x600` browser layout | Added `npm run validation:sandbox-tablet`; it caught and fixed undersized Snake hold and B1/B2 controls after HD scaling. See [record](validation/2026-07-10-sandbox-tablet-layout.md). | Codex |
| 2026-07-10 | Fixture/runtime contract | Petanque admin | Accepted for legacy parity contract | Added `npm run validation:petanque-parity` for migrated screens, teleop bindings, publish widgets, monitor topics, app policy, backend defaults, and action presets. See [record](validation/2026-07-10-petanque-legacy-parity-contract.md). | Codex |
| 2026-07-10 | Repo contract | Runtime fixtures and backend policy | Accepted for tracked fixture/backend contract | Added `npm run validation:frontend-backend`; it caught and fixed stale Explorer seeded config plus missing backend publish/recording allowlist entries. See [record](validation/2026-07-10-frontend-backend-coherence.md). | Codex |
| _pending_ | Sandbox simulation | Sandbox teleop lab | Pending | Needs operator pass. | _pending_ |
| _pending_ | Sandbox simulation | Bloom Debug | Pending | Needs live topic pass. | _pending_ |
| _pending_ | Petanque stack | Archived Petanque app, if retained | Pending | Needs a live stack/operator pass only if the workflow remains supported. | _pending_ |

## Exit Criteria For Removing Legacy Fallbacks

Bloom is already the active IHM and `extender_ui` is legacy. A fallback can be archived or made unavailable only when:

- all required app workflows are accepted by the relevant users;
- rollback to legacy paths is documented;
- deployment/security settings are documented for the target environment;
- no high-severity UX issue blocks tablet operation;
- the team agrees which legacy repositories may be archived and which packages still own active low-level behavior.

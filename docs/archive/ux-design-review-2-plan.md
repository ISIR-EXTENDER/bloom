# Design review 2 — implementation plan and working notes

> Archived on 2026-09-17. This is evidence of a review that closed, not current documentation. See
> [`docs/archive/README.md`](README.md) for what replaced it.

The source material is the externally produced, Git-ignored `Bloom UX design review 2/handoff/` folder. This tracked
document is Bloom's durable source of truth: it summarizes the handoff so later work never depends on that folder being
present. The ten supplied PNGs are comparison references at 1280x720, not mockups to slice.

This file tracks what is done, what is next, and how the work is run. Update it at each step.

## Status

| Lot | Scope | State |
| --- | --- | --- |
| 0.1 | Scanning cannot drive a joystick | **Done** — `b1bd774` |
| J | Joystick lab: virtual physical-joystick workflow and runtime frame selection | **Done** |
| 0.2 | Dwell and scanning are exclusive | **Done** |
| 0.3 | 44 px versus 56 px kiosk bar, recorded in an ADR | **Done** |
| 0.4 | Runtime says nothing when the fit drops below 1.0 | **Done** |
| 0.5 | Capability gating extended to the runtime | **Done** |
| 1 | Runtime settings panel | **Done** — `1e2e2ee` |
| 2 | `language` on `UserProfile` plus string catalogs | **Done** |
| 3 | Guided tours | **Done** |
| 4 | Read-only supervisor mirror | **Done** |

## Lot 0.1, as delivered

`SCAN_TARGET_SELECTOR` is now `button:not([disabled]):not([data-scan-switch])`. The pad and
the native slider are gone from the scan set because `click()` on them emits nothing. Under
the `scan` preset the renderers fall into the same step-target branch that `step` and `dwell`
already used, through `resolveStepTargetPreset` in `control-renderers.tsx`. The switch bar is
a full-width button carrying `data-scan-switch`, so the strip fires the lit target without
ever becoming one.

Explorer and Kinova seeds gained two profiles, `operator` and `one-switch`. Without a profile
that selects `scan`, the fix is unreachable from the interface.

Tests: `switch-scanning-drive.test.tsx` renders a real screen through `ScreenArtboard`, scans
to a direction, fires, and asserts a movement intent leaves. That is the test the handoff
asked for: the old one only checked that the highlight moved.

## Lot J, inserted by the product owner

Source: `Bloom UX design review 2/joystick_lab_design/handoff/`. Robin needs a complete IHM
equivalent of the physical joystick before the remaining review work continues. It reuses the
existing joystick, slider, mode, gripper, topic-echo, kiosk, and STOP contracts. The only new
runtime action is `teleop-frame`.

Deliverables:

1. Add the supplied `Joystick lab` screen to Explorer Manager and Kinova Manager.
2. Carry a command button's `runtime_binding` into its intent. A `teleop-frame` intent changes
   the session's active command frame without calling the backend.
3. Enforce the safety invariant in the dispatcher: reject a frame change while the composed
   twist is non-zero. The frame controls must also render disabled and explain why while moving.
4. Disable and explain a frame that is absent from `runtimeCapabilityReport.command_frame_ids`;
   an unknown capability report remains unknown, not unavailable.
5. Keep the selected frame visible in the kiosk bar and stamp the next widget and gamepad
   command with it. Mark the selected frame with the existing requested-selection treatment.
6. Cover every Joystick Lab control under the `scan` profile and retain the momentary Snake
   release on `pointercancel`.
7. Add `11-joystick-lab` to `scripts/ros-e2e-capture.mjs`, capture it against the live ROS
   stack at 1280x720, and compare it with the interactive
   `joystick_lab_design/Bloom Joystick Lab.dc.html` reference. The handoff names an image file,
   but the delivered folder currently contains the HTML reference and no `images/11-*.png`.

The implementation stays frontend-only apart from the tracked seed JSON, as the handoff
requires. The app-level `runtime_policy.command_frame_id` remains the session default and
deployment fallback; Joystick Lab changes the one effective frame for the current runtime
session, never one widget independently.

Delivered in Explorer Manager and Kinova Manager with app-level wiring, scan coverage, runtime capability gating,
zero-motion frame interlock, kiosk/gamepad propagation, and the `11-joystick-lab` ROS capture. The dated evidence is in
`docs/validation/2026-09-16-joystick-lab-end-to-end.md`. During live comparison, the handoff's `axes` fields were mapped
to canonical `axis_hints`, and Rotation/Pivot were narrowed by one pixel to preserve the maintained STOP reserve at
`1024x600`. The capture is now tracked in the README beside a reproducible 1:55 Explorer walkthrough covering Drive,
Joystick Lab, feedback, command sources, and Bloom Debug. Kinova uses the same tutorial with its documented
`effector_frame` allowlist; neither artifact is physical-hardware acceptance.

## Lot 0.2, as delivered

`UserProfile.dwell_enabled` now enables dwell independently of the motor preset; `dwell_ms` stays duration-only because
its default is nonzero. Legacy `motor_accessibility_preset: "dwell"` profiles still enable the same behavior. The
scanner exposes a stable `activateCurrent` action, the SWITCH bar calls it on click, and dwell uses its own button
selector so resting on SWITCH can fire the highlighted scan target without adding SWITCH to the scan order.

Explorer and Kinova **One switch** profiles opt into the combined mode. The app-level test dwells on SWITCH and asserts
a movement intent. The live ROS session produced a nonzero conditioned scan step without a press; capture comparison
and evidence are in `docs/validation/2026-09-16-scan-dwell-end-to-end.md`.

## Lot 0.3, as delivered

ADR 0127 keeps the shared runtime kiosk bar at 44 px and separates it from the settings prototype's 56 px internal
header. Runtime, lot 1 settings, and lot 3 tours budget from the shared bar once: 556 px remain at `1024x600`, and 676
px remain at `1280x720`. A local header consumes that remaining body instead of redefining or stacking kiosk chrome.

The tracked handoff summary now resolves the historical narrative notes against the handoff's current 44 px kiosk
specification. Architecture points to the decision, and the live reference comparison is recorded in
`docs/validation/2026-09-16-kiosk-height-decision.md`.

## Lot 0.4, as delivered

`resolveRuntimeCanvasFit` now keeps the raw fit threshold separate from the 0.99 overflow guard and returns a typed
warning whenever the authored artboard must shrink. Maintenance reports the authored width and height, the actual
guarded render percentage, and the 44 px touch-floor risk. Nothing new appears over the operating controls.

Pure scale tests cover the warning threshold and one-to-one guard case; the kiosk test proves the warning is absent
until Maintenance opens. A live `1280x720` Explorer capture reported the `1280x720` canvas at 89% and was compared with
the maintenance reference. Evidence is in `docs/validation/2026-09-16-runtime-fit-warning.md`.

## Lot 0.5, as delivered

`createRuntimeControlStateByWidgetId` now resolves every widget definition against the capability report already used
by Builder. Explicitly missing seams add a typed `unavailable` state and the backend's concrete reason; a null report is
still unknown and leaves the widget alone. `WidgetFrame` preserves the authored control and geometry, makes its content
inert and inaccessible to activation, and presents an operator-readable unavailable notice. `RuntimeWorkspace` also
drops intents from an unavailable widget as a second boundary.

A real no-ROS API reported all seams unavailable: nine Explorer Drive widgets remained visible, nine content trees were
inert, and their notices carried the backend details. The parallel ROS-ready capture had normal controls and matched the
maintained hierarchy in reference `01`. Evidence is in
`docs/validation/2026-09-16-runtime-capability-gating.md`.

## Lot 1, as delivered

`RuntimeSettingsPanel` opens from Maintenance as a replacement surface, never over robot controls. The selected
profile's normalized overrides live in the existing localStorage payload under
`profileOverrides[configId:appId:profileId]`; corrupt JSON and invalid fields are ignored. `resolveRuntimeProfile`
applies the override after base-profile normalization and reuses its existing numeric clamps.

The five-category rail exposes the four implemented movement behaviors, fine tuning, backend-reported command frames,
language selection, and read-only display facts. Edge movement stays visible but disabled because no runtime behavior
implements it. Numeric values use 88x72 -/+ controls, dwell is an independent toggle plus duration, and every
interactive setting is reachable through scanning. Undo restores the opening overrides.

The bottom safe preview implements draft step, latch, scan, dwell, and repeat timing in local component state. Entering
Settings clears the teleop composer and resets its stream before and after the runtime controls unmount. A live
ROS-enabled browser probe observed no WebSocket frames from Left, Forward, or Right preview clicks. Evidence and
reference comparison are in `docs/validation/2026-09-16-runtime-settings.md`.

## Lot 2, as delivered

`UserProfile.language` accepts `en`, `es`, or `fr` in the shared API type and backend model, with English as the
fallback for existing profiles. Per-locale catalogs cover runtime status, STOP/resume, kiosk and Maintenance, scanner,
Settings, and the empty-screen state. Maintenance offers a compact language switch; Settings shows the full language
names. Both write through the existing per-profile override path.

Authored application, screen, and widget labels remain configuration data and are not translated in code. Technical
values such as topics, frame IDs, axes, and numbers also remain unchanged. Catalog-shape, fallback, immediate switching,
status, and STOP tests protect the contract. `visual:smoke` adds English, Spanish, French, and 40%-expanded pseudo
captures at `1280x720`, including an element-bound check for the Settings preview controls. Live ROS captures cover
Maintenance, language Settings, and a French runtime. Evidence is in
`docs/validation/2026-09-16-runtime-language.md`.

## Lot 3, as delivered

The runtime practice path is a replacement surface with no action client, robot-intent callback, or teleop callback.
Its movement action uses the current application's joystick title and direction label but changes only local counters.
STOP/resume and Maintenance practice use the production hold durations; scanning and dwell use the selected profile.
The five action checks persist per configuration and application, and the tour remains available from Maintenance and
Settings.

The no-adapter question is resolved without relying on deployment state: the no-ROS backend uses the no-op teleop
gateway and reports teleop unavailable, while this practice component has no command interface at all. The copy says
that the practice controls are disconnected from robot commands; it does not claim that the physical robot or the live
runtime session is disconnected.

Builder App Configuration now offers a six-step review of native geometry, touch bounds and overlap, command frame,
topic policy, profile preview, and JSON export. Configuration-derived checks cannot be advanced by a generic button;
profile and export complete only through the actual preview and download actions. The topic check opens the first
offending screen. It exposed blank Explorer and Kinova `Runtime events` widgets, now bound to `/mode_request`, and a
false warning for local `teleop-frame` controls, now correctly modeled as having no ROS topic destination.

Focused tests cover real actions, persistence, scanning, policy diagnosis, and the command-gateway boundary. Visual
smoke includes both review surfaces across maintained viewports; live `1280x720` captures are `09-runtime-tour` and
`10-builder-review`. Evidence is in `docs/validation/2026-09-16-guided-tours.md`.

## Lot 4, as delivered

Runtime library app cards now open a stable `#/runtime/supervisor/:config/:app` route, and a running app can open the
same mirror in a new tab from Maintenance. Direct routes resolve the encoded app rather than using the previous Builder
selection. The mirror shows app, configured robot, command frame, shared backend STOP latch, connection/session state,
and relevant ROS topic readiness with automatic two-second refresh.

Command ownership remains with the operator. `createSupervisorRuntimeClient` strips the full runtime client to status
and connection reads, including the backend ownership snapshot; the rendered surface has no artboard, movement, STOP,
resume, topic-publish, configured-action, claim, or release controls. It truthfully reports whether an operator owns
control. Since the
manager publishes no active-mode state, a fresh mirror reports mode as not checked and distinguishes browser-session
requests from controller confirmation.

Focused tests cover route round trips, exact direct-link selection, separate-tab entry, the reduced client object, and
absence of command calls. Visual smoke covers the mirror across maintained viewports and asserts every topic tile fits.
Live capture `12-supervisor-mirror` passed at `1280x720` against the running ROS-enabled stack. Evidence is in
`docs/validation/2026-09-16-supervisor-mirror.md`; ADR 0128 records the read-only ownership boundary.

## Next steps, in order

The refreshed implementation packet is complete. Runtime tabs now use an explicit non-forcing backend lease; this does
not grant the supervisor role authority. Continue with the remaining physical-device/operator acceptance and the open
design items in `docs/ux-design-handoff.md`; add a supervisor takeover protocol only if that role receives commands.

## Second review pass, 2026-09-17

A follow-up review listed thirteen findings. Two P0s and three P1s had already been closed by the lots above; the rest
were fixed in this pass, one commit each.

| # | Finding | State |
| --- | --- | --- |
| 1 | STOP not atomic with command publication | Already fixed: the stop gate serializes commands, and a failed assertion returns 503 |
| 2 | Leaving runtime could leave motion streaming | Already fixed: suspend publishes an explicit zero on every lifecycle change |
| 3 | Explorer speed controls did not control the manager | Already fixed: sliders start at the configured limits and go inert without a subscriber |
| 4 | Joystick use could exceed the backend rate limit | Already fixed: the client rate gate coalesces to one latest-value stream |
| 5 | Command failures invisible, UI became false | Already fixed: controls wait for the acknowledgement |
| 6 | No operator ownership or true supervisor mirror | Ownership fixed earlier; the mirror now reads the operating session's frame and mode from the backend |
| 7 | Installations never received shipped app updates | Fixed: unedited copies are stamped and upgraded, `config status` gains `outdated` |
| 8 | Frame allowlist disagreed with the robot | Fixed: only base, hybrid, and the named end-effector frame are offered |
| 9 | Telemetry died on reconnect, subscriptions stacked | Fixed: screens resubscribe on reconnect, handles are keyed by widget |
| 10 | Hold snake was pointer-only | Fixed: keyboard, scanning and dwell latch it, with the 15-second attention expiry |
| 11 | Visual gate missed visible collisions | Fixed: deployed viewports, chrome-overlap and clipping assertions |
| 12 | Positions shared one process-global library | Fixed: poses are scoped to the application that saved them |
| 13 | Production authentication unusable from the dashboard | Fixed: `VITE_BLOOM_API_KEY` on HTTP calls and the socket handshake |

The observer role that list called for now exists on the server. `BLOOM_OBSERVER_API_KEY` authenticates a principal
that may read runtime control state, the STOP latch, the audit log, saved positions, and the ROS topic catalog, and may
open the runtime socket for live status and topic samples. Its teleop commands and its attempts to claim or release
control are refused by the server, not hidden by the interface, so a supervisor screen can hold a key that cannot take
the arm.

### Fixed: STOP no longer covers a widget

The widened visual gate found a real instance of finding 11 on shipped apps. STOP is 176x132 of chrome pinned to the
bottom-right of the viewport, drawn over the artboard, and at 1024x600 it covered a joint-target echo on Explorer
Positions by 128x115, with the same corner taken on Robot feedback and Command sources. Kinova Manager carried the
identical geometry.

Both apps now keep that corner clear. On the 1280x720 artboard no widget ends past x=1070 while also reaching below
y=545, which is the lane STOP occupies once the screen is scaled to the smallest panel:

| Screen | Change |
| --- | --- |
| Positions | The joint-target echo narrows from 610 to 420 |
| Command sources | The event log narrows from 610 to 420 |
| Robot feedback | The lower row rebalances into three columns ending at x=1070 |

The boundary was measured, not guessed: at 440 wide the echo still clipped STOP by five pixels, so the lane edge sits
near x=1085 and the screens stop short of it.

The gate asserts every Explorer screen on every run, so authoring a widget back into that corner fails CI rather than
shipping. Sandbox's lab screens still tile into the corner and stay exempt: their topic echoes grow as samples arrive,
so asserting there measures the fixture rather than the layout.

Reserving STOP a lane in the shell, which is what `kiosk-runtime-spec.md` describes, remains the structural fix. It
would protect screens nobody has authored yet, at the cost of fit on every screen, and it is still worth deciding.

## How the work is run

One lot, one commit, tested end to end before the commit. Conventional commits, imperative
mood, lowercase description, no attribution footers. Comments stay at one to three lines; the
reasoning belongs in the commit message.

### Checks

```bash
npm run check                 # biome, from the repository root only
npx vitest run --root frontend/apps/bloom-dashboard
npx vitest run --root frontend/libs/widget-renderers
npx tsc -b frontend/apps/bloom-dashboard
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run --project backend pytest backend/tests && rm -rf data
```

`npm run check` returns a false failure when run from a workspace subdirectory. Run it from
the repository root and echo the exit code.

### End-to-end captures

`scripts/ros-e2e-capture.mjs` drives the real stack with Playwright at 1280x720 and writes
the twelve review capture names. Nothing is mocked, unlike `npm run visual:smoke`.

```bash
# 1. cartesian_manager plus the feedback a robot would publish
source /home/susana/workspace/extender/extender_workspace/install/setup.bash   # needs set +u
ros2 run cartesian_manager cartesian_manager_node --ros-args --params-file \
  "$(ros2 pkg prefix cartesian_manager)/share/cartesian_manager/config/explorer_params.yaml"
ros2 topic pub -r 10 /joint_states sensor_msgs/msg/JointState "{name: [joint_1, joint_2, \
  joint_3, joint_4, joint_5, joint_6], position: [2.5, 0.3, -2.4, 2.97, 1.2, -0.5]}"
ros2 topic pub -r 10 /ee_pose geometry_msgs/msg/PoseStamped \
  "{header: {frame_id: base_link}, pose: {orientation: {w: 1.0}}}"
ros2 topic pub -r 10 /ee_velocity geometry_msgs/msg/TwistStamped "{header: {frame_id: base_link}}"

# 2. the API with its ROS gateways, on an isolated store
cd backend && BLOOM_CONFIGURATION_DATABASE_PATH=/tmp/bloom-e2e.db BLOOM_ROBOT_NAME=Explorer \
  uv run python -m apps.bloom_cli.main api run-ros --host 127.0.0.1 --port 8000

# 3. the dashboard
VITE_BLOOM_API_URL="" npm run dev --workspace @bloom/dashboard -- --port 5173 --strictPort

# 4. the captures
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 01-runtime-ready,07-runtime-scanning --out /tmp/bloom-captures
```

Restart the API whenever a seed changed; startup upgrades every copy nobody edited. For a copy
that was edited, run `bloom config seed --force <id>` first. Then open each capture next to its reference in
`Bloom UX design review 2/handoff/images/` and compare in this order: reading order,
hierarchy, target sizes, density. A hue difference is expected, a target-size difference is a
defect. Captures 04, 05, 06, and 08 now cover the delivered Settings and language lots.
Captures 09 and 10 cover the guided runtime practice and Builder review.
Capture 12 covers the read-only supervisor mirror and its live status reads.

Record every session under `docs/validation/` with what was and was not verified. A bench
result is never a hardware claim.

### Seeds

Seed JSON is written with `json.dumps(..., indent=2)`, ASCII-escaped, one trailing newline.
Round-trip a file before editing it so the diff stays to the lines that changed.

## Decisions taken while implementing

- **The scan set follows the app's widgets, not the prototype's grid.** Reference image 07
  shows a 4x4 grid because its prototype screen has four widgets. Deriving the set from the
  DOM keeps the handoff's real rule, which is that every axis of every widget has a target.
- **Step targets shrink to 44 px, not 56.** A 260 px card clipped the fourth target at 56.
  44 px is the floor the handoff sets; nothing renders below it.
- **The switch bar is a button that is not a target.** Anything else either makes the bar
  scan itself or forces the hook to special-case the DOM.
- **The shared kiosk bar is 44 px.** A screen-local 56 px header, including Settings, spends
  the remaining body budget and does not change or duplicate the shared bar; see ADR 0127.
- **Practice safety is structural.** The tour receives no runtime action client or teleop callback. Its generated labels
  can match the live app without giving its controls a path to the robot.
- **Builder checks describe real state.** Geometry, touch bounds, overlap, frame, and topic policy derive from the saved
  app. Profile preview and export complete only when those actions are actually used.
- **Supervisor ownership is structural.** The mirror receives a projected read-only client and lives on a stable
  per-app route; opening a second screen cannot implicitly grant command methods or take control from the operator.

## Open questions

- Can one user hold several named profiles, chair and bed and tired day? `profilePreferences`
  stores one profile per app, which assumes yes, but nothing creates one. Lot 1's shape
  depends on the answer: edit one profile, or select and duplicate.

## Carried over from the architecture review

- `kinova_params.yaml` upstream still lists Explorer's six-joint home targets. A Kinova
  running those named targets would move to a pose derived from another arm. Report to the
  package owner; do not patch a colleague's repository.
- `cartesian_manager` publishes no mode feedback, so Bloom shows the last requested mode and
  not the confirmed one. Say "requested" in the interface until the manager publishes state.
- `hybrid_frame` is unexploited. Exposed as "which way is forward" it gives the operator
  frame the adaptive-orientation paper argues for, against the robot frame.

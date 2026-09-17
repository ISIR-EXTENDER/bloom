# Bloom UX Design Handoff

Tracked summary reviewed 2026-09-17, including the refreshed implementation packet reviewed against Bloom tree
`7377900`. This document preserves the actionable content of the Claude design-review handoffs inside Bloom. Those
source folders are externally produced and may be replaced, so current product documentation must link here rather than
depend on their contents. The third handoff, delivered on 2026-09-17, is tracked in
[`docs/design/`](design/) instead of being summarised here.

## Product Baseline

Bloom is the active Extender IHM. `extender_ui` is legacy software retained as a behavior reference and emergency
rollback while live acceptance is completed; it is no longer the product Bloom is waiting to replace.

The shipped operating contract is in [operator-runtime.md](operator-runtime.md). This handoff records what the current
design source asked for, what has landed, and what remains for the next review. It replaces the deleted
`docs/migration-plan.md` as the tracked open-work document.

## Source Review Summary

The source review was designed around a wheelchair-mounted robot arm and a 10.1-inch HMTECH panel. The original
specification uses `1024x600`; the refreshed implementation packet describes `1280x720` as native and uses that size for
its screenshots. Until the physical deployment is confirmed, Bloom maintains `1024x600`, `1280x720`, and `1820x720`
checks rather than silently choosing one source claim. The central principle is that the operator watches the gripper,
not the screen, and may use touch, keyboard, a gamepad, a switch, dwell, or another assistive input. Input method should
change how an intent is produced, not the ROS adapter that receives it.

The source material contains:

- a 14-finding review ranked P1 to P3;
- a pixel-level kiosk runtime specification for `1024x600`;
- an accessibility model covering step, latch, scan, gamepad, dwell, audio, and profile conditioning;
- an accessible settings and onboarding proposal;
- an EN/ES/FR localization proposal;
- design rationale emphasizing operator language, truthful status, stable control placement, and explicit command
  frames;
- a short product manifesto centered on restoring a person's gesture rather than exposing robotics implementation;
- a refreshed five-lot implementation packet, five code corrections, and ten `1280x720` prototype reference captures;
- a later Joystick Lab handoff, delivered as an interactive HTML reference and screen JSON, for a virtual equivalent of
  the physical joystick workflow.

The strongest requirements are: remove builder chrome during operation, reclaim panel space, provide a truthful status
and real STOP, protect physical target size after canvas fitting, prevent overlaps, use human direction words, make motor
profiles observable, expose one meaningful Cartesian frame, support eyes-off operation, and distinguish operator and
supervisor roles.

## Implementation Trace

| Finding | Status | Merged behavior | Remaining gap |
| --- | --- | --- | --- |
| 1. Runtime wears builder chrome | Delivered | Kiosk surface; exits and screen switching require the 1.5 second maintenance hold. | Physical-tablet validation. |
| 2. Chrome consumes the panel | Delivered | One fixed 44 px kiosk bar. | Check density on every lab geometry. |
| 3. No stop or sign of life | Delivered in software | Truthful status plus backend-latched STOP and one-second resume hold. | Accept against the robot and hardware safety chain. |
| 4. Target size is discounted by fit | Partial | Builder reports the selected widget's size on the smallest panel of its device class, and the review checklist measures every control on every screen there and names the first below 44 px; runtime Maintenance reports authored geometry and actual scale below 1.0. | No prevention or reflow once a canvas is fit-scaled. |
| 5. Silent overlap | Partial | Maintained operator seeds and Sandbox validation reject overlapping interactive controls. | Generic immediate collision feedback in the builder. |
| 6. Adapter-language axis labels | Delivered | Pads use operator direction words; technical axes remain in details. | Validate vocabulary per app with operators. |
| 7. Motor preset was a no-op | Partial | Step, latch, independently enabled dwell, large targets, assisted touch, per-axis dead zone, repeat guard, and a 15-second held-value timeout exist. Runtime Settings now changes and safely previews the supported interaction values; under `scan`, both operation and Settings are scannable. | `reduced-motion`, edge layout, and validation with the intended devices remain. |
| 8. Muted contrast failed | Delivered | Token corrected and semantic contrast tests expanded. | Review in real lab lighting. |
| 9. Contributor-oriented onboarding | Partial | Builder and Runtime are distinct; each runtime app has a persistent, action-based local practice tour, and Builder has an eleven-check review. The library marks the role used last on this device and preselects it, but never opens by itself. | Automatic first-launch offer of the practice tour. |
| 10. Builder cannot see tablet | Partial | The canvas is panel-true at the screen's own class, `1280x720` tablet or `1920x1080` desktop, with the class named above it; the glass chip and the review's touch step measure at the class's smallest panel. | Switching a canvas between device frames, and a live whole-screen touch view rather than a checklist step. |
| 11. Forward must mean operator forward | Delivered for configuration | App policy supplies the default; Joystick Lab selects a supported session frame at zero motion, shared by widgets and gamepad. Settings no longer offers a frame, because it changes what the app publishes: a stored per-profile override is ignored and removed. | Installation-specific egocentric mapping and final operator-facing frame names. |
| 12. Operator looks at the gripper | Partial | Keyboard, gamepad, directional scanning, dwell, and sounds for stop/link loss/recovery. | Cross-screen spatial consistency, possible latch cue, and real eyes-off tests. |
| 13. Operator and supervisor surfaces | Partial | Read-only per-app mirror shows shared STOP/topic/session state, explicitly leaves control with the operator, and receives no command methods. | Validate the second display; define deliberate handover only if supervisory commands are introduced. |
| 14. Language belongs to the person | Delivered for the runtime shell | `UserProfile.language` defaults to English; EN/ES/FR catalogs cover status, STOP, Maintenance, scanning, Settings, and empty states. Maintenance and Settings persist a per-profile choice. | Native-speaker safety review and a future schema for independently localized authored labels. |

## Remaining Design Work

### P1 - safe operation and physical accessibility

- ~~**Fix directional switch scanning.**~~ Delivered 2026-09-16; see `docs/validation/2026-09-16-switch-scanning-end-to-end.md`. The scanner included a joystick's `role="application"` target and called
  `click()`, but the pad emits movement only from pointer or keyboard direction input. Render the four step directions
  while scanning and test the emitted movement intent, not only focus movement.
- ~~**Surface unsafe fit scaling.**~~ Delivered 2026-09-16; Maintenance reports the authored canvas, actual rendered
  percentage, and touch-floor risk without covering controls. Prevention/reflow and whole-screen target analysis remain.
- ~~**Create accessible runtime settings.**~~ Delivered 2026-09-16; the full-screen surface uses large
  decrement/increment controls, reversible per-profile overrides, scanning/dwell at the draft timing, and a safe local
  preview. Entering Settings suspends composed teleop before controls unmount. See
  `docs/validation/2026-09-16-runtime-settings.md`.
- ~~**Add runtime language.**~~ Delivered 2026-09-16; profile-backed EN/ES/FR catalogs cover the operator shell,
  Maintenance and Settings both expose the choice, and visual smoke captures all three locales plus a 40%-expanded
  pseudo pass. Authored labels remain configuration data and technical values remain unchanged. See
  `docs/validation/2026-09-16-runtime-language.md`.
- **Add device-frame review.** Provide `1024x600`, `1280x720`, and `1820x720` builder frames plus a whole-screen touch
  check. The current inspector check covers one widget at one target.
- **Validate all input modes.** Step, latch, scan, dwell, keyboard, gamepad, large targets, audio, and conditioning are
  implemented. Suitability for a person's device, reach, hearing, and fatigue is not established by unit tests.
- **Resolve reduced motion.** Browser `prefers-reduced-motion` works, but selecting the profile value itself has no
  independent effect.
- **Finish eyes-off operation.** Review fixed control placement between screens, decide on a latch-state cue, and test
  while the operator watches the arm rather than the display.
- **Validate command-frame language.** Define the operator-facing frame name and installation workflow for egocentric
  movement on each chair/arm setup.

### P2 - configuration and recovery

- ~~**Gate unavailable runtime capabilities.**~~ Delivered 2026-09-16; runtime keeps each explicitly unsupported widget
  visible, makes its content inert, and displays the backend reason. Unknown reports do not create false failures.
- **Make collision feedback generic.** Flag overlap while authoring instead of relying only on seed and browser checks.
- ~~**Build action-based guided tours.**~~ Delivered 2026-09-16. Runtime practice is structurally local-only, uses the
  selected app labels and accessibility profile, and completes from movement and hold actions. Builder checks derive
  from saved app state, profile preview, and export. See `docs/validation/2026-09-16-guided-tours.md`.
- **Design camera recovery.** Permission denial, missing devices, and stream loss need one clear operator action, then
  validation with Robin's visual-servoing setup.
- ~~**Add the supervisor mirror.**~~ Delivered 2026-09-16 as a read-only per-app status route with live backend
  ownership state and no command or lease-mutation client surface. Runtime-to-Runtime handover is explicit and
  non-forcing; second-display acceptance remains, and supervisor takeover still needs a separate design if that role
  ever commands. See `docs/validation/2026-09-16-supervisor-mirror.md` and
  `docs/validation/2026-09-16-runtime-control-ownership.md`.
- **Expose profile coverage.** App authors need to see which profiles were designed and tested for an app instead of
  assuming every enum value is supported by every layout.

### P3 - entry and language review

- Remember whether a person normally operates or builds and route them accordingly; the tours are now reusable from
  their respective workspaces but are not an automatic first-entry fork.
- Review frame, fault, recovery, and maintenance vocabulary with operators and supervisors.

## Refreshed Implementation Order

The latest handoff proposed this order. The state column records what now exists:

| Lot | Priority | State | Scope |
| --- | --- | --- | --- |
| 0 | P1/P2 | Delivered | Fix directional scanning, define scan/dwell composition, record the 44 px bar decision, surface unsafe fit, and gate unavailable runtime capabilities. |
| 1 | P1 | Delivered | Add operator-usable runtime profile settings and a non-commanding live preview, with defensive local preference persistence. |
| 2 | P1 | Delivered | Add EN/ES/FR profile language, runtime string catalogs, pseudo-locale tests, and locale captures while keeping authored labels as configuration data. |
| 3 | P2 | Delivered | Add action-based operator and builder tours with persistent real-action checks and a structurally local-only practice surface. |
| 4 | P2 | Delivered | Add a read-only supervisor status mirror on a stable per-app route; do not grant robot commands implicitly. |

The settings design also depends on a product answer: whether a person has one editable profile or several named,
duplicable profiles for different positions or fatigue levels.

## Detailed Proposals Still To Decide

The review also specified concrete prototype choices. They are useful design input, not accepted behavior merely because
they appeared in the handoff:

- whether the general canvas should gain a dedicated no-scroll `1024x600` layout with an edge-control mode and a clear
  center, or meet the same physical requirements through app/profile-specific screens;
- which panel geometry is authoritative: the original `1024x600` spec or the refreshed packet's `1280x720` native claim;
- ~~whether continuous speed sliders should become large slow/medium/fast segments~~: decided 2026-09-17 by splitting
  Drive into two layouts. Operator gets Slow / Medium / Fast segments, Bench keeps continuous limits with a 56 px
  thumb, and both publish the same topics. The Explorer segment values still need an operator's confirmation;
- whether an application needs a supervisor code; Maintenance now contains language and profile Settings;
- whether profiles can be named, exported, and reused across a lab session and daily setup;
- whether the current reusable practice entry should also appear automatically on first app launch;
- the final French and Spanish safety wording, which requires native-speaker and operator review.

The refreshed packet retains historical notes saying the kiosk specification requested 56 px, while its current kiosk
specification and the merged runtime use 44 px. ADR 0127 records 44 px as the shared bar and budgets 556 px of body at
`1024x600` or 676 px at `1280x720`. The settings proposal's 56 px header is local content inside that body, not another
kiosk height. Change the shared value only through an explicit design/architecture update.

## Engineering Work Outside The Design Review

- Add a robot profile so Extender topic, mode, actuator, feedback, and frame defaults stop living in several frontend and
  backend constants.
- Add authoritative mode feedback when `cartesian_manager` publishes it. Bloom currently shows last requested, not
  confirmed controller state.
- Decide Petanque's future. Its Bloom application is archived and still uses `/teleop_cmd`; either validate and maintain
  that path or retire the workflow deliberately.
- Add a concrete non-ROS transport only when a real non-ROS project needs one; keep the ROS-free backend path healthy.

## Live Validation Still Required

- HMTECH mapping, target-size comfort, clipping, STOP reachability, and maintenance hold at `1024x600`, `1280x720`, and
  `1820x720`.
- Explorer and Kinova motion in every offered frame, including release-to-zero and simultaneous command sources.
- Neutral, Jaco, momentary Snake, gripper `[1.1]`/`[0.2]`, speed limits, positions, fault reset, and STOP against the
  actual robot/controller chain.
- Physical gamepad mapping, center release, disconnect, and contention with touch or visual servoing.
- Real switch scanning with optional dwell confirmation, plus keyboard, latch, step, audio, and repeat guard with
  intended users.
- Guided practice comprehension, hold timing, and the handoff from practice to live controls with intended users.
- Supervisor mirror readability on the intended second display and confirmation that operator ownership language is
  understood; no command handover is implemented.
- Robin visual-servoing camera/tag behavior and an opt-in rosbag capture from Bloom Debug.
- Petanque only if the archived workflow is still expected to run.

Record completed sessions under `docs/validation/`. A fixture, browser, or bench result must not be promoted to a live
hardware claim.

## Legacy Cleanup

`extender_ui` is already legacy. Deleting, archiving, or making it unavailable is separate and should wait until required
rollback artifacts are captured, the relevant live sessions are accepted, and the team confirms that no unique
configuration or Petanque behavior remains there.

Low-level Extender ROS packages remain active. Bloom is the IHM above the controllers, robot interfaces, simulation,
hardware, and message contracts; it does not replace them.

## Third Design Review, 2026-09-17

A third handoff folder was delivered on 2026-09-17 and is tracked inside Bloom rather than summarised
here: [`docs/design/`](design/) holds the living reference, the screen specs, the device classes, the
widget minimum-size contract and the pad recipe, [`docs/design/implementation-plan.md`](design/implementation-plan.md)
records how it was built, and [`docs/design/reviews/`](design/reviews/) carries the Drive review, the
implementation review and the design gap review. What it changed is in the operator guide, not here.
The scope it deliberately left open — the 1024×600 collapse layouts, paired desktop apps, the
save-a-pose flow and left-handed mirroring — is listed in the implementation review.

## Second Design Review

A second handoff folder, `Bloom UX design review 2/handoff/`, was delivered on 2026-09-16 with
five code fixes and four work packages. Its implementation plan, working notes, and open
questions live in `docs/archive/ux-design-review-2-plan.md`, which is the file to read before
continuing that work. The later `joystick_lab_design/handoff/` adds the Joystick Lab screen,
session frame selector, zero-motion frame interlock, capability-disabled choices, and command
echo. Its source folder remains external; this paragraph and the implementation plan preserve
that contract in Git.

## Updating This Trace

When the external design-review folder is refreshed:

1. compare its findings and decisions with this document;
2. update the implementation table and remaining design work here;
3. link new code decisions and dated validation records;
4. keep speculative design clearly separate from merged runtime behavior.

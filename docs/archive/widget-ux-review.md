# Widget UX Review

> Archived on 2026-09-17. This is evidence of a review that closed, not current documentation. See
> [`docs/archive/README.md`](README.md) for what replaced it.

Last reviewed: 2026-09-17

Bloom is the active Extender IHM. This review now describes the merged kiosk/widget behavior; unfinished design work is
tracked in the [UX design handoff](../ux-design-handoff.md).

This review looks at Bloom widgets from a user-centered, tablet-first perspective. The goal is not to expose every
technical detail on every widget. The goal is to help an operator understand what a widget does, touch it comfortably,
and recover confidence quickly when something is not configured.

## Review Criteria

- Can the user understand the widget without knowing the backend configuration?
- Is the primary action easy to touch on the target tablet?
- Does runtime hide non-essential debug text by default?
- Are details still available when a screen is intentionally a debug screen?
- Does the widget preserve standard accessibility affordances such as labels, focus, and readable state?

## Current Widget Families

| Widget | Current UX state | Critical notes |
| --- | --- | --- |
| Button / command button | Good foundation | Uses configured labels, supports momentary press/release, confirm-press for motion, saved presets, and service calls. Controller progress still depends on an upstream feedback contract. |
| Toggle | Improved | Runtime now shows human state labels such as `Active` / `Inactive`, hides topics by default, and keeps `aria-pressed`. App builders should customize labels for real devices. |
| Slider | Good foundation | Large Radix handle, return-to-center option, operator intent labels, optional units, details hidden by default. Sandbox V0.0 and the sandbox teleop lab now have visual smoke coverage at tablet and HD sizes. |
| Joystick | Good foundation | Pointer-native, large tactile control, deadzone, continuous publish, zero-on-release. Runtime layout now gives joysticks more room on `1024x600`; still needs per-app mode copy validation with real operators. |
| Camera / stream | Good foundation | Webcam/stream views work and browser frames can publish as validated `CompressedImage`. Permission and live-device recovery still need design validation. |
| Topic echo | Debug-oriented | Correct for Bloom Debug, but should be used intentionally. Details remain visible by default because it is a debug widget. Its header names the active command frame, and its own words follow the profile's language; message text does not. |
| Topic plot | Debug-oriented | First-party area/sparkline/bar telemetry, units, hidden technical details, and plot freeze are available. Multi-series inspection moved to the plot board. |
| Plot board / picker / value strip | Good foundation | Up to eight series from the series ramp over a `history_seconds` window, timed by the receiving browser, with a y range that widens to the data and readings marked stale after three seconds. Command sources adds a verdict on which input is driving. |
| Joint table / Jacobian | Desktop-only | Bloom Debug reads `/joint_states` and `/ee_jac`, says **not reported** where joint limits or the matrix are missing, and compares manipulability with this session's best rather than a guessed threshold. |
| Label | Improved | Renders configured text, alignment, and font size. Needs style presets once instruction/status blocks become common. |
| Gauge | Good foundation | Accessible meter with min/max/value/unit and optional live topic/field binding. Good for battery, score, progress, or simple state. Needs clearer unit/intent copy in the builder. |
| Plot | Good foundation | First-party sparkline with readable latest value and optional live topic/field binding. Good for preview/simple telemetry; richer runtime plots may need a chart library. |
| Robot 3D | Extension placeholder | No fake 3D yet, but the placeholder communicates joint topic and future adapter boundary without looking broken. It can now confirm live `/joint_states` flow. |
| Momentary command | Good foundation | Legacy Extender momentary controls now publish a press payload and a release payload. Needs visual pressed-state review on the physical tablet. |
| Topic monitor | Improved migration path | Legacy multi-topic monitors are expanded into individual Bloom topic echo widgets. Good enough for visual-servoing monitor screens; a true add/remove-topic monitor editor remains future work. |
| Position library | Good foundation | Saves the current joint state, deletes a saved pose behind a confirm press, and exports the manager's `joint_targets` block. A pose cannot be replayed or renamed from Bloom, because the manager moves only to targets it loaded at start. Live manager progress is unavailable, so target moves use confirmation and explicit release. |
| Unknown | Safe fallback | Keeps missing widgets visible to builders without crashing runtime. |

## Fixes Applied In This Review

- Command widgets now use user-facing button labels instead of the generic `Send` label.
- Toggle widgets now use configurable active/inactive labels instead of raw `ON` / `OFF`.
- Toggle topic details are hidden by default so device controls are cleaner in runtime.
- Topic plot widgets can hide technical topic and field details while still showing sample count.
- Topic plot latest values are formatted with optional units and rendered with first-party SVG telemetry variants.
- Camera stream status now uses concise operator text: `Ready` or `Source needed`.
- Widget frames now expose better accessible names using the widget title and kind.
- Button/toggle touch targets now fill their widget area more comfortably.
- Label widgets now avoid debug metadata and render configured operator text.
- Gauge, plot, and robot-3D widgets now have useful runtime renderers instead of generic placeholders.
- Seeded app fixtures are tested so shipped apps do not include empty runtime screens.
- Runtime workspace layout no longer reserves Bloom Debug panel space for normal operator apps, improving joystick and
  slider comfort on tablet viewports.
- Runtime operator mode is now a kiosk with one 44 px status bar. App/library/builder/help/edit/screen switching lives
  behind a 1.5 second maintenance hold.
- Gauge, plot, event-log, and robot-3D widgets can now receive live runtime topic samples.
- Legacy Extender `momentary-ros-message` and `topic-monitor` widgets now migrate into usable Bloom runtime widgets.
- Sandbox V0.0 visual smoke now covers the six imported screens.
- Sandbox V0.0 runtime screens now use human titles while keeping stable legacy screen IDs for migration traceability.
- Legacy navigation buttons now switch runtime screens locally, and B1/B2 mode controls are visible toggles that publish
  the agreed mode values.
- The visual-servoing monitor plots velocity/error XYZ fields from `TwistStamped` samples instead of only showing raw
  message echoes.
- Slider widgets now support operator intent labels and units, and Sandbox V0.0 uses them for teleop gain, Z velocity,
  and RZ/yaw velocity.
- Visual smoke now includes the app configuration page and validates the sandbox runtime at `1024x600`, `1280x720`, and
  `1820x720`.
- Visual smoke now also covers Bloom Debug runtime with mocked topic catalog, runtime WebSocket subscription ACKs, and
  live topic samples so debug regressions are visible in screenshot review.
- Runtime operator apps now show truthful link/stop state plus configured robot, command frame, gamepad, and profile.
  A fixed STOP is backed by the backend latch and requires a one-second hold to resume.
- Runtime applies the same capability vocabulary as Builder: an explicitly unsupported widget stays in place, becomes
  inert, and displays the backend reason; unknown capability state is not presented as failure.
- Joysticks support keyboard operation, direction words, per-axis profile conditioning, step/latch behavior, dwell
  activation, and composition with Z/RZ sliders and a physical gamepad. Scan renders directional step targets, and
  `dwell_enabled` may activate direct targets or the highlighted target through SWITCH.
- Every authorable widget kind declares a minimum size and grows rather than clips, and the builder offers the exact
  resize instead of blocking the save.
- Streams that can outgrow their card — the echo, the event log, the position library, the plot picker and the joint
  table — scroll inside their authored height rather than pushing past it.
- Speed limits render either as a continuous slider with a 56 px thumb, or as Slow / Medium / Fast segments whose
  labels wrap in every locale.

## Remaining UX Risks

- Some imported legacy screens still contain dense layouts that were designed before Bloom's runtime card chrome.
- `snake_control` is operational and less sparse after the B1/B2 and Snake Hold controls were enlarged, but still needs
  physical tablet review for pressed-state comfort.
- Debug widgets are useful but can make an operator screen feel like a console if used without intention.
- The widget inspector should make "operator clean mode" versus "debug details mode" obvious for every widget.
- Apps now own the default Cartesian command frame, and Joystick Lab can safely select one supported session frame at
  zero motion. Frame and mode names still need operator-language review per robot.
- Camera/webcam behavior still needs live validation against Robin's visual-servoing pipeline and the ROS-side image
  processing split.

## Next Recommended Fixes

1. Run kiosk, STOP, virtual-IHM, command-frame, and accessibility profile checks on the physical tablet and robot.
2. Add clearer camera permission guidance with one recovery action for operator screens.
3. Prevent or reflow controls that fall below the physical touch floor after fit scaling; runtime Maintenance now
   exposes the authored geometry and actual scale but does not resolve the layout.
4. Evaluate a richer chart dependency only when real runtime requirements need zoom, cursor inspection, or longer
   offline traces. The first-party plot board already covers multi-series telemetry.
5. Add authoritative mode state only when the manager exposes feedback; keep last-requested mode labeled honestly until
   then.

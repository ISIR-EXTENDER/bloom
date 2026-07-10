# Widget UX Review

Date: 2026-07-10

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
| Button / command button | Improved | Runtime now uses the configured action label or widget title instead of a generic "Send". Needs action progress states when long-running actions land. |
| Toggle | Improved | Runtime now shows human state labels such as `Active` / `Inactive`, hides topics by default, and keeps `aria-pressed`. App builders should customize labels for real devices. |
| Slider | Good foundation | Large Radix handle, return-to-center option, details hidden by default. Sandbox V0.0 and the sandbox teleop lab now have visual smoke coverage at tablet and HD sizes. Needs clearer units when configured. |
| Joystick | Good foundation | Pointer-native, large tactile control, deadzone, continuous publish, zero-on-release. Runtime layout now gives joysticks more room on `1024x600`; still needs per-app mode copy validation with real operators. |
| Camera / stream | Good foundation | Webcam and stream views work; status text is now more human. Needs ROS image stream adapter and clearer permission fallback copy. |
| Topic echo | Debug-oriented | Correct for Bloom Debug, but should be used intentionally. Details remain visible by default because it is a debug widget. |
| Topic plot | Debug-oriented | Now uses first-party SVG area/sparkline/bar telemetry, formats latest values with units, and can hide technical topic/field details. Pause/clear controls remain a future debug refinement. |
| Label | Improved | Renders configured text, alignment, and font size. Needs style presets once instruction/status blocks become common. |
| Gauge | Good foundation | Accessible meter with min/max/value/unit and optional live topic/field binding. Good for battery, score, progress, or simple state. Needs clearer unit/intent copy in the builder. |
| Plot | Good foundation | First-party sparkline with readable latest value and optional live topic/field binding. Good for preview/simple telemetry; richer runtime plots may need a chart library. |
| Robot 3D | Extension placeholder | No fake 3D yet, but the placeholder communicates joint topic and future adapter boundary without looking broken. It can now confirm live `/joint_states` flow. |
| Momentary command | Good foundation | Legacy Extender momentary controls now publish a press payload and a release payload. Needs visual pressed-state review on the physical tablet. |
| Topic monitor | Improved migration path | Legacy multi-topic monitors are expanded into individual Bloom topic echo widgets. Good enough for visual-servoing monitor screens; a true add/remove-topic monitor editor remains future work. |
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
- Runtime operator mode now uses a compact menu for app/library/builder/help/edit/screen switching instead of a
  full-width tab row.
- Gauge, plot, event-log, and robot-3D widgets can now receive live runtime topic samples.
- Legacy Extender `momentary-ros-message` and `topic-monitor` widgets now migrate into usable Bloom runtime widgets.
- Sandbox V0.0 visual smoke now covers the six imported screens.
- Visual smoke now includes the app configuration page and validates the sandbox runtime at `1024x600`, `1280x800`, and
  `1920x1080`.
- Visual smoke now also covers Bloom Debug runtime with mocked topic catalog, runtime WebSocket subscription ACKs, and
  live topic samples so debug regressions are visible in screenshot review.

## Remaining UX Risks

- Some migrated legacy screens still contain dense layouts that were designed before Bloom's runtime card chrome.
- Imported Sandbox V0.0 screen titles still use technical IDs, which is good for traceability but not ideal for operators.
- `snake_control` is usable but visually sparse/awkward on the native tablet height and needs layout polish.
- Debug widgets are useful but can make an operator screen feel like a console if used without intention.
- The widget inspector should make "operator clean mode" versus "debug details mode" obvious for every widget.
- Sliders still need unit labels and intent labels, especially when controlling velocity, gains, or angles.
- Joysticks still need app-level mode presets so Explorer/Petanque/Sandbox can present mode labels that match the
  operator's mental model.
- Camera/webcam behavior still needs live validation against Robin's visual-servoing pipeline and the ROS-side image
  processing split.

## Next Recommended Fixes

1. Polish imported Sandbox V0.0 screen titles and tablet layouts, starting with `snake_control` and `control_panel`.
2. Add unit and intent labels to slider runtime settings.
3. Add clearer camera permission guidance with one recovery action for operator screens.
4. Add pause, clear, and copy controls to topic plot widgets if live debugging requires freezing plotted samples.
5. Evaluate a richer chart dependency only when real runtime requirements need multi-series plots, zoom, cursor
   inspection, or longer offline traces.
6. Decide whether Bloom should implement a shared mode-store abstraction or keep mode changes as explicit configured ROS
   publishes for the first Extender handover.

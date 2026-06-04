# Widget UX Review

Date: 2026-06-04

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
| Slider | Good foundation | Large Radix handle, return-to-center option, details hidden by default. Needs more visual QA on crowded tablet layouts and clearer units when configured. |
| Joystick | Good foundation | Pointer-native, large tactile control, deadzone, continuous publish, zero-on-release. Needs visual QA per app mode and optional simplified labels for non-debug operators. |
| Camera / stream | Good foundation | Webcam and stream views work; status text is now more human. Needs ROS image stream adapter and clearer permission fallback copy. |
| Topic echo | Debug-oriented | Correct for Bloom Debug, but should be used intentionally. Details remain visible by default because it is a debug widget. |
| Topic plot | Debug-oriented | Now formats latest values with units and can hide technical topic/field details. Needs real chart rendering and pause/clear controls. |
| Label | Improved | Renders configured text, alignment, and font size. Needs style presets once instruction/status blocks become common. |
| Gauge | Good foundation | Accessible meter with min/max/value/unit. Good for battery, score, progress, or simple state. Needs live data binding. |
| Plot | Good foundation | First-party sparkline with readable latest value. Good for preview/simple telemetry; richer runtime plots may need a chart library. |
| Robot 3D | Extension placeholder | No fake 3D yet, but the placeholder communicates joint topic and future adapter boundary without looking broken. |
| Unknown | Safe fallback | Keeps missing widgets visible to builders without crashing runtime. |

## Fixes Applied In This Review

- Command widgets now use user-facing button labels instead of the generic `Send` label.
- Toggle widgets now use configurable active/inactive labels instead of raw `ON` / `OFF`.
- Toggle topic details are hidden by default so device controls are cleaner in runtime.
- Topic plot widgets can hide technical topic and field details while still showing sample count.
- Topic plot latest values are formatted with optional units.
- Camera stream status now uses concise operator text: `Ready` or `Source needed`.
- Widget frames now expose better accessible names using the widget title and kind.
- Button/toggle touch targets now fill their widget area more comfortably.
- Label widgets now avoid debug metadata and render configured operator text.
- Gauge, plot, and robot-3D widgets now have useful runtime renderers instead of generic placeholders.
- Seeded app fixtures are tested so shipped apps do not include empty runtime screens.

## Remaining UX Risks

- Some migrated legacy screens still contain dense layouts that were designed before Bloom's runtime card chrome.
- Debug widgets are useful but can make an operator screen feel like a console if used without intention.
- The widget inspector should make "operator clean mode" versus "debug details mode" obvious for every widget.
- Sliders need unit labels and intent labels, especially when controlling velocity, gains, or angles.
- Joysticks need app-level mode presets so Explorer/Petanque/Sandbox can present mode labels that match the operator's mental model.

## Next Recommended Fixes

1. Add unit and intent labels to slider runtime settings.
2. Add pause, clear, and copy controls to topic echo/plot widgets.
3. Add richer chart rendering for topic plots only when real runtime requirements need more than the first-party sparkline.
4. Add camera permission guidance with one clear recovery action.
5. Add visual smoke snapshots for the sandbox teleop lab and Bloom Debug screens specifically.

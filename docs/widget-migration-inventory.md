# Widget Migration Inventory

This inventory reviews reusable UI ideas from `extender_ui` before migrating more Bloom widget foundations.

Roadmap ownership lives in `docs/migration-plan.md`.

Use this file as an inventory and classification reference only. Do not maintain ordered next steps here.

## Source Generations

`extender_ui` currently has two widget generations:

- **Canvas widgets** in `src/components/widgets`: newer, closer to Bloom's target model, with canvas rects, per-widget
  settings, runtime mode, and JSON persistence.
- **Tab widgets** in `src/components/widgets/WidgetRenderer.tsx` and `src/app/widgetCatalog.ts`: older composite panels
  for fixed pages such as controls, camera, logs, poses, debug, and Petanque.

Bloom should migrate reusable primitives from both generations, but the canvas generation is the primary source.

## Generic-First Classification

| Legacy widget / idea | Bloom direction | Why |
| --- | --- | --- |
| `joystick` | Generic input widget | Tactile 2D control can serve teleop, camera, games, servoing, and teaching apps. |
| `slider` / `max-velocity` | Generic scalar input widget | Axis, speed, angle, alpha, power, and threshold controls are reusable. |
| `button` | Generic action button | Topic/payload actions are already generic. |
| `ros-message-toggle` | Generic message action/toggle widget | Fully configurable topic/message/payload is reusable across robot stacks. |
| `toggle-publisher` | Generic toggle action widget | Simpler ON/OFF publisher remains useful. |
| `gripper-control` / `magnet-control` | Generic device toggle/action widget | Device name and payloads should be configurable instead of tied to gripper/magnet. |
| `stream-display` | Generic stream viewer | Camera, RViz, visualization, webcam, image result, and iframe use cases are reusable. |
| `curves` / old `curvesPlots` | Generic plot/timeseries widget | Recharts-based telemetry plotting can serve many apps. |
| `logs` / old logs widgets | Generic log/event viewer | Runtime logs, sessions, recording status, and diagnostics are lab-wide needs. |
| topic visualization / topic echo | Generic debug and supervision widgets | Minimal PlotJuggler-like timeseries and console-style topic echo views are key for robot debugging. |
| `text` / `textarea` | Generic label/text block widgets | Needed for status, instructions, JSON results, and formatted output. |
| `navigation-button` / `navigation-bar` | Generic app navigation widgets | Builder/runtime app navigation needs this independently from robot logic. |
| `rosbag-control` | Generic recording/session command widget | Could control rosbag or other recording/session backends from selected topics and approved folders. |
| `mode-button` | Generic state/mode command widget | Runtime mode switching is not Extender-only if modeled as state-machine action. |
| `save-pose-button` / `load-pose-button` | Generic stored-command/preset widgets | Pose is one preset type, but saved commands/configurations are reusable. |
| `throw-draw` | Generic gesture/trajectory input candidate | The Petanque use case is specific, but drawing an angle/power/gesture command is reusable. |
| `drink` | Generic media/action overlay candidate | It is playful, but technically a media overlay/action button pattern. |

## Likely True App-Specific Behavior

Keep these outside Bloom core until extension points are ready:

- Petanque state-machine semantics such as exact flow stages and command names.
- Petanque measure result interpretation and demo image defaults.
- Petanque alpha safety confirmation policy.
- Any hard-coded topic family that cannot be configured from the app builder.

The widget UI can still be generic while the runtime adapter is app-specific.

## Foundation Priorities

These priorities explain why a widget family matters. The current implementation order is tracked in
`docs/migration-plan.md#ordered-next-steps`.

1. **Control primitives**
   - Interactive slider using `@radix-ui/react-slider`.
   - Interactive joystick using `nipplejs`.
   - Shared value-change intents and topic bindings.

2. **Message/action primitives**
   - Generic action button.
   - Generic ROS/message action button.
   - Toggle action with typed payloads.
   - Session/recording action contract.
   - Rosbag-style recording widget with topic selection, output folder selection, start/stop status, and adapter-backed
     commands.

3. **Display primitives**
   - Stream viewer for camera/RViz/visualization/webcam/image result.
   - Text/textarea/status block.
   - Plot/timeseries viewer using `recharts`.
   - Minimal topic visualization for velocities, torques, positions, and scalar/vector telemetry.
   - Console-style topic echo viewer for in-app ROS/debug monitoring.
   - Topic inspector for browsing available topics, message types, frequencies, and recording eligibility.
   - Log/event viewer.

4. **Builder primitives**
   - Navigation button/bar.
   - Widget inspector metadata for every reusable field.
   - App/screen selection model.

5. **Advanced reusable controls**
   - Gesture/draw control for angle/power/trajectory-like commands.
   - Media overlay/action widget.
   - Saved preset/pose command widgets.

## Dependency Notes From `extender_ui`

- `@radix-ui/react-slider` worked well for slider primitives.
- `nipplejs` worked well for tactile joystick control.
- `recharts` worked well for plots.
- Streams should stay first-party React/browser components around `<video>`, `<img>`, `<iframe>`, and `getUserMedia`.
- `zustand` worked for local UI state, but Bloom should introduce global state only when the builder/runtime needs it.

## Migration Rule

Do not ask "is this Petanque?". Ask:

> Could another ISIR app use this if topic names, labels, payloads, and runtime adapters were configurable?

If yes, migrate it as a generic Bloom widget foundation first.

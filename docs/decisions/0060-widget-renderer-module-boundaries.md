# 0060 - Split Widget Renderers By Runtime Family

## Status

Accepted.

## Context

The first production-readiness review identified
`frontend/libs/widget-renderers/src/index.tsx` as too large for a foundation
library. The file mixed registry wiring, settings readers, action widgets,
camera rendering, debug widgets, and control widgets in one place.

That made the code harder to test, harder to migrate from `extender_ui`, and
too easy to accidentally couple unrelated widget families.

## Decision

Keep `index.tsx` as a public facade and split implementation into small modules:

- action renderers for command/toggle/label widgets;
- control renderers for slider and joystick widgets;
- camera renderers for stream and webcam widgets;
- debug renderers for topic echo and plot widgets;
- fallback renderers for unknown and placeholder widgets;
- settings readers and shared renderer types.

Runtime widget CSS is also split out of the dashboard app stylesheet into a
focused runtime-widget stylesheet.

## Consequences

- Future widget migrations can be reviewed by family instead of touching one
  large file.
- Tests can target control-specific behavior such as joystick sizing and slider
  readouts without dragging in unrelated widget code.
- The dashboard app keeps product layout styles separate from runtime widget
  rendering styles.

# Runtime Capability Gating Validation

Date: 2026-09-16

Repository and live-browser validation that runtime widgets tell the truth about their required backend seams. This is
not robot, operator, or assistive-device acceptance.

## Contract

- Widget definitions and `GET /api/v1/capabilities` use the same requirement vocabulary.
- An explicitly unavailable requirement keeps the widget visible, makes its content inert, and shows why.
- Runtime drops action intents from an unavailable widget.
- A null or failed capability report is unknown, not unavailable, and does not disable widgets.
- A fully available report leaves the normal runtime unchanged.

## Disconnected Evidence

An isolated Bloom API was launched with its real Noop gateways, an isolated SQLite store, and no ROS adapters. Its
capability endpoint reported command, service, data, teleop, and recording seams unavailable with concrete details. A
Playwright session at `1280x720` launched Explorer Manager and recorded:

```json
{"unavailableWidgets":9,"inertContents":9}
```

The capture at `/tmp/bloom-runtime-capability-gating/01-runtime-unavailable.png` keeps every Drive control in its
authored location. Teleop widgets say that no teleop gateway is connected; command widgets say that no ROS publisher is
connected. The kiosk also truthfully reports `LINK DOWN`. No API response or browser route was mocked.

## ROS Evidence And Comparison

Against the existing ROS-enabled API, the standard capture completed:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 01-runtime-ready --out /tmp/bloom-runtime-capability-gating-live
```

The result has no unavailable notices and was compared with
`Bloom UX design review 2/handoff/images/01-runtime-ready.png`. The maintained Explorer app differs from the prototype's
Sandbox composition, but preserves the expected ready kiosk, direct controls, fixed STOP, hierarchy, and density.

## Automated Evidence

- Readiness tests cover backend detail and the fallback when an older report omits a requirement.
- Runtime-state tests cover explicit unavailable seams and unknown reports.
- Renderer tests prove an unavailable control remains in the DOM, is inert, is explained, and emits no click intent.
- Joystick Lab's app-level frame and motion test uses an explicit available capability report and still passes.
- `npm test`: 551 tests passed across the dashboard, API client, UI, widget renderers, and widget libraries.
- `npm run build`: passed for all frontend workspaces.
- `npm run check`: passed with the repository's two pre-existing warnings.

## Still Required

- Verify unavailable/readiness language with operators and each deployment's real failure modes.
- Validate transitions when a backend gains or loses a seam during a session; the current report is fetched once.

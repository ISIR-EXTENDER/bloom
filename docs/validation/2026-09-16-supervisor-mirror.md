# Supervisor Mirror Validation - 2026-09-16

## Scope

Lot 4 of the second UX design review: stable per-app supervisor routing, live read-only status, explicit operator
ownership, second-tab entry, and the guarantee that the mirror cannot receive robot command methods.

## Safety Boundary

`createSupervisorRuntimeClient` projects the runtime client to connection observation, `getRuntimeStopState`, and
`listRosTopicStatus`. `SupervisorWorkspace` receives only that projected type. It renders no runtime artboard, movement
control, STOP, resume, topic publisher, or configured action. Its ownership notice states that the operator retains
control.

The mirror reports the shared backend STOP latch but cannot change it. Because `cartesian_manager` has no authoritative
mode feedback, a fresh tab reports mode as **Not checked** and says no mode request was observed in that browser session.

## Automated Evidence

- Route tests cover encoded supervisor targets and malformed URL fallback.
- Client-projection tests assert that publish, teleop, configured-action, STOP, and resume methods are absent.
- App tests cover exact direct-link app selection, Runtime-library entry, Maintenance separate-tab entry, status reads,
  and the absence of command calls and controls.
- The focused dashboard run passed 108 tests, the complete frontend run passed 585 tests, and the production builds
  passed.
- `npm run visual:smoke` passed its complete route/viewport/locale matrix. The supervisor route was captured at
  `1024x600`, `1280x800`, and `1920x1080`; an internal bounds assertion checks every topic tile.

## Live Capture

Against the already running ROS-enabled API and dashboard:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 12-supervisor-mirror --out /tmp/bloom-lot4-live
```

The `1280x720` capture completed. Visual inspection confirmed clear ownership language, the Explorer app/robot/frame,
the running STOP latch, live API/session/topic states, one missing visual-servoing topic, no clipped topic tile, and no
command control. The existing API and dashboard processes were not restarted or altered for this check.

## Not Proven

This session did not command physical Explorer or Kinova hardware. It does not establish readability on the intended
second display, supervisor/operator comprehension, network-loss behavior in the lab, or any control handover. Bloom has
no supervisor command or handover feature; adding one requires a separate safety design and validation record.

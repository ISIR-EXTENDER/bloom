# Scan And Dwell End-to-End Validation

Date: 2026-09-16

Repository-level and ROS-bench validation that switch scanning and pointer dwell can operate together. This is not
physical switch, eye tracker, head pointer, tablet, or operator acceptance.

## Contract

- `UserProfile.dwell_enabled` controls dwell independently of `motor_accessibility_preset`.
- Existing profiles whose preset is `dwell` keep their previous behavior without migration.
- A `scan` profile can set `dwell_enabled: true`; scanning still renders step targets and advances its highlight.
- The SWITCH bar is a dwell target but never enters the scan target list. Clicking it, including the synthetic click
  produced after a dwell, activates the currently highlighted target.
- `dwell_ms` remains the bounded `400..4000` duration and cannot enable dwell by itself because its default is nonzero.
- STOP resume retains its one-second target minimum.

Explorer Manager and Kinova Manager now ship their **One switch** profile with `dwell_enabled: true` and
`dwell_ms: 1000`.

## Live Evidence

The live stack used the installed Explorer `cartesian_manager`, feedback publishers, an isolated ROS-enabled Bloom API,
and the dashboard at `1280x720`. The capture command completed without mocks:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5174 node scripts/ros-e2e-capture.mjs \
  --only 07-runtime-scanning --out /tmp/bloom-scan-dwell-capture
```

The result was compared with `Bloom UX design review 2/handoff/images/07-runtime-scanning.png`. The maintained Explorer
screen follows the same requirements: directional step targets, a strong scan outline, no inert joystick pad in the
scan order, a fixed STOP, and a full-width SWITCH bar. Its layout follows the app's actual controls instead of copying
the prototype's illustrative 4x4 Sandbox grid.

Playwright selected the tracked **One switch** profile, launched Explorer Manager, moved the pointer onto SWITCH, and
waited 1.2 seconds without pressing. The dwell progress reached `1`, the highlighted scan direction fired, and a
filtered live ROS echo received:

```yaml
header:
  frame_id: base_link
twist:
  linear: {x: 0.0, y: 0.062499999999999986, z: 0.0}
  angular: {x: 0.0, y: 0.0, z: 0.0}
```

The value is the expected `0.25` scan step after the profile/widget's scaled `0.2` axis dead zone.

## Automated Evidence

- The combined hook test rests on SWITCH and asserts a real movement intent from the highlighted direction.
- Runtime profile tests cover explicit `scan + dwell_enabled` and legacy `motor_accessibility_preset: dwell`.
- Backend model, seed, and SQLite tests preserve the new field and its bounds.
- `npm test`: 542 tests passed across the dashboard, API client, UI, widget renderers, and widget libraries.
- `make test` in `backend/`: 313 tests passed with external pytest plugins disabled by the repository target.
- `npx tsc -b frontend/apps/bloom-dashboard`: passed.
- `npm run build`: passed for all frontend workspaces.
- `npm run check`: passed with the repository's two pre-existing warnings.

## Still Required

- Validate timing, fatigue, accidental activation, and the switch/dwell combination with the intended devices and
  operators.
- Decide in runtime settings whether dwell is presented as a simple enable plus duration or as named setup choices.

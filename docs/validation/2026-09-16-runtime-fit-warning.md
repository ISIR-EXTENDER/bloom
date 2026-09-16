# Runtime Fit Warning Validation

Date: 2026-09-16

Repository and live-browser validation that a fitted runtime artboard no longer shrinks silently. This is not a
physical-panel target-size or operator acceptance result.

## Contract

- A raw fit result below `1.0` creates a warning; the 0.99 overflow guard alone does not.
- The percentage describes the actual CSS render scale after that guard.
- The warning names the authored artboard size and 44 px touch-floor risk.
- The warning appears inside Maintenance only, never over operating controls.

## Live Evidence

The existing ROS-enabled API and dashboard produced a fresh Maintenance capture without mocks:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 03-runtime-maintenance --out /tmp/bloom-unsafe-fit-capture
```

At `1280x720`, Explorer Manager reported `Composed for 1280 × 720, shown at 89%`. The warning appeared above screen
switching and maintenance actions while the control surface remained behind the scrim. The capture was compared with
`Bloom UX design review 2/handoff/images/03-runtime-maintenance.png`: the reference has no fit disclosure and uses its
older wider panel, while the maintained screen preserves the same maintenance hierarchy and adds the warning first.

## Automated Evidence

- Pure fit tests cover a shrinking `1820x720` canvas and the one-to-one overflow-guard case.
- The kiosk test proves the alert is absent during operation and appears after the 1.5 second Maintenance hold.
- The focused run passed 17 tests across the fit and kiosk suites.
- `npm test`: 546 tests passed across the dashboard, API client, UI, widget renderers, and widget libraries.
- `npm run build`: passed for all frontend workspaces.
- `npm run check`: passed with the repository's two pre-existing warnings.

## Still Required

- Measure every interactive target at the actual `1024x600`, `1280x720`, and `1820x720` panel mappings.
- Choose prevention, reflow, panning, or dedicated layouts where the warning identifies an unacceptable fit.

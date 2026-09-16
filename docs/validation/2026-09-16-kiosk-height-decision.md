# Kiosk Height Decision Validation

Date: 2026-09-16

Documentation and live-browser validation for ADR 0127. This records the maintained shared kiosk height; it is not a
physical-tablet or operator acceptance result.

## Contract

- The shared runtime kiosk bar is 44 px.
- The runtime body receives 556 px at `1024x600` and 676 px at `1280x720` before its own padding and content.
- A 56 px settings or tour header is local content inside that body and does not replace or duplicate the shared bar.
- The 44 px interactive-target floor is an independent accessibility rule.

## Automated Evidence

- `--runtime-operator-bar-height` and `.runtime-kiosk-bar` both resolve to 44 px.
- `kiosk-shell.test.tsx` covers the maintained kiosk shell and maintenance entry.
- The focused Vitest run passed all 13 kiosk-shell tests.
- `npm run check` passed with the repository's two pre-existing warnings.

## Live Evidence

The existing ROS-enabled API and dashboard produced a fresh `1280x720` capture without mocks:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 01-runtime-ready --out /tmp/bloom-kiosk-height-capture
```

Playwright then measured `.runtime-kiosk-bar` as `44` CSS pixels with computed height `44px`. The capture was compared
with `Bloom UX design review 2/handoff/images/01-runtime-ready.png`. The maintained runtime keeps the same single-strip
hierarchy, truthful operating context, Maintenance entry, and control surface directly below it. The reference carries
the historical taller strip; the maintained 44 px bar deliberately returns that vertical space to controls, as ADR
0127 records.

## Still Required

- Validate the vertical composition on the intended `1024x600`, `1280x720`, and `1820x720` panels.
- Recheck the body budgets when lot 1 settings and lot 3 guided tours are implemented.

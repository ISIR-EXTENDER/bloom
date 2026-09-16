# Guided Tours Validation - 2026-09-16

## Scope

Lot 3 of the second UX design review: five-step runtime practice, six-step Builder review, persisted completion, current
profile accessibility behavior, and the guarantee that practice controls cannot reach robot command gateways.

## Safety Boundary

`RuntimeGuidedTour` receives application labels, the selected screen and profile, and an `onDone` callback. It does not
receive the runtime action client, an action-intent callback, or a teleop-contribution callback. Its movement control
increments local state; its STOP/resume and Maintenance holds also change local state only. Opening the replacement
surface suspends composed teleop before live controls unmount.

The app-level test opens practice through the real Maintenance flow, uses the generated movement control twice, and
asserts that both `sendTeleopCommand` and `publishRosTopic` remain untouched. This is stronger than relying on a no-ROS
deployment, although the no-ROS backend also uses no-op gateways and reports teleop unavailable.

## Builder Checks

The review derives native geometry, 44 px interactive bounds, overlap, command frame, and topic allowlist checks from
the saved application. Profile preview and JSON export complete only through those actions. The topic action opens the
first offending screen.

The review exposed two real configuration/model issues during capture:

- Explorer and Kinova `Runtime events` had no source and could never show an event; both tracked seeds now read
  `/mode_request` history.
- `teleop-frame` buttons were described as publishers without a topic even though they change local runtime context;
  the shared destination resolver now correctly returns no ROS destination for them.

## Automated Evidence

The focused runtime and Builder suites cover action-only completion, persistence after remount, scan-profile behavior,
configuration-derived checks, preview/export actions, and problem-screen navigation. The shared destination suite
covers local frame controls. The app test covers the command-gateway boundary.

`npm run visual:smoke` passed its complete route/viewport matrix and added `runtime-tour` and `builder-review` captures
at `1024x600`, `1280x800`, and `1920x1080`, with horizontal-overflow assertions.

## Live Capture

Against the already running ROS-enabled API and dashboard:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 09-runtime-tour,10-builder-review --out /tmp/bloom-lot3-live
```

Both captures completed at `1280x720`. Visual inspection found clear reading order, targets at or above the specified
size, no overlap, and an explicit local-only practice message. The Builder capture also exposed the unbound event log
described above; the tracked seed fix was then verified with the mocked visual route because the live SQLite store was
deliberately not overwritten.

## Not Proven

This session did not command physical Explorer or Kinova hardware. It does not establish comprehension with intended
operators, physical switch/dwell timing, target comfort, or whether practice should appear automatically on first app
launch. Those remain product and target-device acceptance work.

# Runtime Settings Validation

Date: 2026-09-16

Repository and ROS-bench validation of the per-profile Runtime Settings surface. This is not physical switch, pointer,
tablet, operator, or robot-motion acceptance.

## Contract

- Settings opens from the guarded Maintenance overlay and replaces robot controls.
- Entering it clears all composed teleop sources and stops the previous stream.
- Overrides are normalized, bounded by `resolveRuntimeProfile`, stored under `configId:appId:profileId`, and restored
  when the same application/profile is reopened.
- Numeric tuning uses 88x72 decrement/increment targets; there are no sliders.
- The screen's own scanner and dwell hooks use the current draft period and duration.
- Undo restores the overrides present at opening.
- Safe-preview controls have no robot-action callback or dispatch path.

## Live Evidence

The existing ROS-enabled API and dashboard produced fresh Explorer Manager captures without mocks:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 04-settings-movement,05-settings-tuning --out /tmp/bloom-lot1-settings
```

The `1280x720` results were compared with handoff references `04-settings-movement.png` and
`05-settings-tuning.png`. They preserve the 56 px header, five-category rail, large direct choices, numeric steppers,
and separate dashed preview band. The maintained version additionally exposes repeat guard and the independent dwell
toggle introduced by Lot 0.2. Lot 2 subsequently replaced the language placeholder with EN/ES/FR selection; see
`2026-09-16-runtime-language.md`.

A second Playwright session at `1024x600` measured a `1022x586` Settings surface, a `230x530` rail, a `792x434`
content pane, and a `792x96` preview. The document and Settings surface had no horizontal or vertical overflow, and all
five tuning rows fit without scrolling or overlap.

After the settings surface settled, Playwright clicked **Left**, **Forward**, and **Right** while recording the live
runtime WebSocket. The clicks produced zero outgoing frames. A scan-period change from `1.4 s` to `1.6 s` was observed
under `explorer-manager:explorer-manager:operator`; after a hard navigation and relaunch of Explorer Manager, the value
remained `1.6 s`.

## Automated Evidence

- Runtime-profile tests prove overrides apply after normalization and reuse the supported clamps.
- Preference tests cover the existing storage payload, malformed fields, and corrupt JSON.
- Settings tests cover the real scan interval, every enabled scan target, Undo, and local-only preview behavior.
- App integration proves Settings removes the runtime artboard, preview clicks call neither teleop nor ROS publish, and
  Done restores operation.
- Stream-pump coverage proves suspension stops immediately without a residual zero tail.
- The dashboard suite, TypeScript build, repository formatter/linter, all frontend workspaces, and backend suite pass.

## Still Required

- Validate target reach, dwell timing, switch timing, fatigue, and accidental activation with the intended devices and
  operators.
- Implement and validate edge-controlled movement before enabling **At the edge**.
- Encode the active app/profile in navigation if direct `#/runtime/app` reloads must restore the same application;
  current persistence is correctly keyed, but that route itself does not identify an app.

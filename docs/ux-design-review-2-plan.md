# Design review 2 — implementation plan and working notes

Source of truth: `Bloom UX design review 2/handoff/` in this repository. Read `README.md`,
`remaining-work.md`, `work-packages.md`, `code-fixes.md`, `settings-and-onboarding.md`,
`i18n.md`, `kiosk-runtime-spec.md`, and `images/README.md` before touching code. The ten PNGs
in `images/` are comparison references at 1280x720, not mockups to slice.

This file tracks what is done, what is next, and how the work is run. Update it at each step.

## Status

| Lot | Scope | State |
| --- | --- | --- |
| 0.1 | Scanning cannot drive a joystick | **Done** — `b1bd774` |
| 0.2 | Dwell and scanning are exclusive | Next |
| 0.3 | 44 px versus 56 px kiosk bar, recorded in an ADR | Not started |
| 0.4 | Runtime says nothing when the fit drops below 1.0 | Not started |
| 0.5 | Capability gating extended to the runtime | Not started |
| 1 | Runtime settings panel | Not started |
| 2 | `language` on `UserProfile` plus string catalogs | Not started |
| 3 | Guided tours | Not started, blocked on a backend answer |
| 4 | Read-only supervisor mirror | Not started |

## Lot 0.1, as delivered

`SCAN_TARGET_SELECTOR` is now `button:not([disabled]):not([data-scan-switch])`. The pad and
the native slider are gone from the scan set because `click()` on them emits nothing. Under
the `scan` preset the renderers fall into the same step-target branch that `step` and `dwell`
already used, through `resolveStepTargetPreset` in `control-renderers.tsx`. The switch bar is
a full-width button carrying `data-scan-switch`, so the strip fires the lit target without
ever becoming one.

Explorer and Kinova seeds gained two profiles, `operator` and `one-switch`. Without a profile
that selects `scan`, the fix is unreachable from the interface.

Tests: `switch-scanning-drive.test.tsx` renders a real screen through `ScreenArtboard`, scans
to a direction, fires, and asserts a movement intent leaves. That is the test the handoff
asked for: the old one only checked that the highlight moved.

## Next steps, in order

1. **Lot 0.2.** Move dwell out of the preset enum. Add `dwell_enabled` to `UserProfile`
   (backend model plus `frontend/libs/api-client/src/index.ts`), keep `dwell_ms` as the
   duration, and enable the hook when `dwellEnabled || preset === "dwell"` in
   `RuntimeWorkspace.tsx`. A scanning user needs dwell to confirm without a firm click.
2. **Lot 0.3.** Write `docs/decisions/0127-*.md` recording that the kiosk bar stays 44 px and
   that the lot 1 and lot 3 vertical budgets are drawn against 44, not the 56 in
   `kiosk-runtime-spec.md`. One source of truth; correct the spec reference in the trace.
3. **Lot 0.4.** When `resolveCanvasFitScale` returns below 1.0, say so in the maintenance
   overlay, never on the controls: "composed for 1820x720, shown at 70%, targets are below
   the touch floor."
4. **Lot 0.5.** If `runtimeCapabilityReport` does not cover a widget's target, the widget
   renders inoperable and says why. It must not disappear.
5. **Lot 1.** `RuntimeSettingsPanel.tsx`, `runtime-profile-overrides.ts`,
   `runtime-settings.test.tsx`. Overrides persist in the existing localStorage key through
   `ui/runtime-user-preferences.ts`, under `profileOverrides[configId:appId:profileId]`, and
   `resolveRuntimeProfile` applies them after normalization, reusing `clampRange` as the
   -/+ bounds. No slider anywhere on this screen; -/+ pairs at 88x72. The try-it strip obeys
   the current values and sends nothing to the robot.
6. **Lot 2.** `language` on `UserProfile` plus `runtime/strings/{en,es,fr}.ts` and
   `useRuntimeStrings`. Start with `runtime-status-chip.ts`, `RuntimeStopControl.tsx`,
   `RuntimeKioskBar.tsx`, and the scan announcement in `RuntimeWorkspace.tsx`, which are the
   files that still hold literals. Widget labels stay config data, one field per locale; do
   not translate them in code.
7. **Lot 3 and lot 4** after that. Lot 3 needs the team's answer on whether a session without
   an adapter is safe, so the practice steps cannot command the arm.

## How the work is run

One lot, one commit, tested end to end before the commit. Conventional commits, imperative
mood, lowercase description, no attribution footers. Comments stay at one to three lines; the
reasoning belongs in the commit message.

### Checks

```bash
npm run check                 # biome, from the repository root only
npx vitest run --root frontend/apps/bloom-dashboard
npx vitest run --root frontend/libs/widget-renderers
npx tsc -b frontend/apps/bloom-dashboard
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run --project backend pytest backend/tests && rm -rf data
```

`npm run check` returns a false failure when run from a workspace subdirectory. Run it from
the repository root and echo the exit code.

### End-to-end captures

`scripts/ros-e2e-capture.mjs` drives the real stack with Playwright at 1280x720 and writes
the ten reference names. Nothing is mocked, unlike `npm run visual:smoke`.

```bash
# 1. cartesian_manager plus the feedback a robot would publish
source /home/susana/workspace/extender/extender_workspace/install/setup.bash   # needs set +u
ros2 run cartesian_manager cartesian_manager_node --ros-args --params-file \
  "$(ros2 pkg prefix cartesian_manager)/share/cartesian_manager/config/explorer_params.yaml"
ros2 topic pub -r 10 /joint_states sensor_msgs/msg/JointState "{name: [joint_1, joint_2, \
  joint_3, joint_4, joint_5, joint_6], position: [2.5, 0.3, -2.4, 2.97, 1.2, -0.5]}"
ros2 topic pub -r 10 /ee_pose geometry_msgs/msg/PoseStamped \
  "{header: {frame_id: base_link}, pose: {orientation: {w: 1.0}}}"
ros2 topic pub -r 10 /ee_velocity geometry_msgs/msg/TwistStamped "{header: {frame_id: base_link}}"

# 2. the API with its ROS gateways, on an isolated store
cd backend && BLOOM_CONFIGURATION_DATABASE_PATH=/tmp/bloom-e2e.db BLOOM_ROBOT_NAME=Explorer \
  uv run python -m apps.bloom_cli.main api run-ros --host 127.0.0.1 --port 8000

# 3. the dashboard
VITE_BLOOM_API_URL="" npm run dev --workspace @bloom/dashboard -- --port 5173 --strictPort

# 4. the captures
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 01-runtime-ready,07-runtime-scanning --out /tmp/bloom-captures
```

Delete the store file before restarting the API whenever a seed changed; seeding skips ids
the store already holds. Then open each capture next to its reference in
`Bloom UX design review 2/handoff/images/` and compare in this order: reading order,
hierarchy, target sizes, density. A hue difference is expected, a target-size difference is a
defect. Captures 04, 05, 06, and 08 fail until lots 1 and 2 exist; that is the point of them.

Record every session under `docs/validation/` with what was and was not verified. A bench
result is never a hardware claim.

### Seeds

Seed JSON is written with `json.dumps(..., indent=2)`, ASCII-escaped, one trailing newline.
Round-trip a file before editing it so the diff stays to the lines that changed.

## Decisions taken while implementing

- **The scan set follows the app's widgets, not the prototype's grid.** Reference image 07
  shows a 4x4 grid because its prototype screen has four widgets. Deriving the set from the
  DOM keeps the handoff's real rule, which is that every axis of every widget has a target.
- **Step targets shrink to 44 px, not 56.** A 260 px card clipped the fourth target at 56.
  44 px is the floor the handoff sets; nothing renders below it.
- **The switch bar is a button that is not a target.** Anything else either makes the bar
  scan itself or forces the hook to special-case the DOM.

## Open questions

- Can one user hold several named profiles, chair and bed and tired day? `profilePreferences`
  stores one profile per app, which assumes yes, but nothing creates one. Lot 1's shape
  depends on the answer: edit one profile, or select and duplicate.
- Is a runtime session without an adapter safe, so lot 3 can offer a practice mode that
  commands nothing? Open with the backend team since 7 September.
- 44 px against the spec's 56 px, to be settled by ADR 0127.

## Carried over from the architecture review

- `kinova_params.yaml` upstream still lists Explorer's six-joint home targets. A Kinova
  running those named targets would move to a pose derived from another arm. Report to the
  package owner; do not patch a colleague's repository.
- `cartesian_manager` publishes no mode feedback, so Bloom shows the last requested mode and
  not the confirmed one. Say "requested" in the interface until the manager publishes state.
- `hybrid_frame` is unexploited. Exposed as "which way is forward" it gives the operator
  frame the adaptive-orientation paper argues for, against the robot frame.

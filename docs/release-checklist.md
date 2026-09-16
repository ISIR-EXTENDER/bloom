# Release Checklist

What has to be true before tagging a Bloom release. Everything here is
executable: if a step cannot be run, it is not a gate, it is a wish.

## 1. Automated gates

All of these must pass from a clean checkout.

```bash
npm install
npm run check          # Biome lint + format
npm run test           # frontend workspaces
npm run build          # production build
npm run audit:security # frontend + backend dependency audits

cd backend
uv sync
make test              # backend suite
```

Do not pin suite totals here; they change whenever coverage improves. The gate is
that the complete current backend and frontend suites run without skipped release
work, Biome is clean, the production build succeeds, and dependency audits meet
the configured severity threshold.

## 2. Contract validation

```bash
npm run validation:extender
npm run validation:frontend-backend
npm run validation:sandbox-runtime
npm run validation:sandbox-tablet
npm run validation:visual-servoing
npm run validation:petanque-parity
```

`validation:frontend-backend` is the one that catches an app's runtime policy
disagreeing with the backend allowlists.

Before releasing, check that nothing you meant to share is still sitting only on
your machine:

```bash
cd backend && uv run python -m apps.bloom_cli.main config status
```

Anything marked `edited` or `local` is unpublished. Share it with
`config publish <app-id>` and commit the file, or leave it deliberately.

## 3. Visual checks

```bash
npm run visual:smoke
npm run capture:readme   # only when the README previews should change
```

For runtime changes, inspect the kiosk bar, fixed STOP, maintenance overlay, effective command frame, control bounds,
and local practice surface at every maintained viewport. For Builder changes, inspect the app review at the same
viewports. A browser capture is layout evidence, not target-tablet acceptance.

## 4. Security posture

- [ ] `npm run audit:security` passes, or every remaining advisory is recorded
      in the changelog with a reason.
- [ ] Production settings refuse to start without `BLOOM_AUTH_ENABLED=true` and
      an admin key. Verify, do not assume:

```bash
BLOOM_ENVIRONMENT=production uv run python -c "
from apps.bloom_api.settings import Settings
try:
    Settings(environment='production')
    print('FAIL: started without auth')
except Exception as exc:
    print('ok, refused:', exc)
"
```

- [ ] `BLOOM_CORS_ALLOWED_ORIGINS` is set to real origins, not `*`.
- [ ] Publish, teleop and recording allowlists contain only topics this
      deployment should be able to reach.

## 5. ROS deployment

Only when the release changes robot-facing behaviour.

- [ ] `BLOOM_ROS_COMMAND_BACKEND` matches the control stack actually running
      (`cartesian_manager`, or `teleop_command` for the legacy path).
- [ ] `BLOOM_ROS_COMMAND_FRAME_ID`, `BLOOM_ALLOWED_COMMAND_FRAME_IDS`, and any
      app-default or session-selected Cartesian command frame match the manager's configured base,
      end-effector, or hybrid frames. An unknown frame is skipped and looks
      exactly like a broken web stack:

```bash
ros2 param get /cartesian_manager frames.default_input_frame_id
ros2 param get /cartesian_manager frames.base_frame
ros2 param get /cartesian_manager frames.ee_frame
ros2 param get /cartesian_manager frames.hybrid_frame
```

- [ ] Bench check against a live manager: teleop reaches `/cartesian_command`,
      a valid mode request is accepted, an invalid one returns 422 and is
      audited. The procedure is in
      [extender-petanque-validation.md](extender-petanque-validation.md).
- [ ] The active manager session has exactly one effective command frame for both virtual controls and a connected
      gamepad, and the kiosk bar shows it before motion. Joystick Lab rejects a frame change until the composed twist
      returns to zero and disables frames absent from backend capabilities.
- [ ] Two joysticks plus Z/RZ release to a zero composed twist; Neutral, Jaco, momentary Snake, gripper open/close, and
      speed controls publish the expected topics and payloads.
- [ ] STOP latches in the backend, is reflected by a second client or reload, and cannot resume without the one-second
      hold. This supplements rather than replaces the hardware emergency-stop check.
- [ ] Any profile claimed by the release is exercised with its intended input: keyboard, step, latch, scan, dwell,
      gamepad, or direct touch. Implemented support is not the same as hardware/user acceptance.

## 6. Documentation

- [ ] `CHANGELOG.md` has an entry for the release, with breaking changes called
      out and their migration note.
- [ ] A decision record exists for any architectural, security, or adapter
      choice that would be hard to infer from the code.
- [ ] A validation record in `docs/validation/` covers what was actually
      verified, and says plainly what was not.
- [ ] The [UX design handoff](ux-design-handoff.md) reflects open
      product/design work, and the operator guide reflects shipped behavior.

## 7. Version

Three files carry the version and must agree:

```bash
npm run check:version
```

It fails when the three disagree, so this is a gate rather than a reading.

## 8. Honest release notes

State what is validated and what is not. Bloom is the active Extender IHM, while
its current robot-facing work is validated at fixture, contract and bench level;
live robot acceptance is still pending. `extender_ui` being legacy does not turn
that pending evidence into a pass. A release note that implies otherwise is the
one mistake in this list that cannot be fixed by a patch release.

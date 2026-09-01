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

Expected at the time of writing: backend 186 tests, frontend 279 across five
workspaces, Biome clean, audits clean apart from one low `esbuild` advisory that
affects the Windows dev server only.

## 2. Contract validation

```bash
npm run validation:extender
npm run validation:frontend-backend
npm run validation:sandbox-runtime
npm run validation:sandbox-tablet
npm run validation:visual-servoing
npm run validation:petanque-parity
```

`validation:frontend-backend` is the one that catches seeded configurations
drifting from their fixtures. If it fails after a fixture edit, refresh the
seeded copies in `backend/data/configurations/` rather than editing them by
hand.

## 3. Visual checks

```bash
npm run visual:smoke
npm run capture:readme   # only when the README previews should change
```

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
- [ ] `BLOOM_ROS_COMMAND_FRAME_ID` matches the manager's
      `default_input_frame_id`. A mismatch is discarded silently and looks
      exactly like a broken web stack:

```bash
ros2 param get /cartesian_manager default_input_frame_id
```

- [ ] Bench check against a live manager: teleop reaches `/cartesian_command`,
      a valid mode request is accepted, an invalid one returns 422 and is
      audited. The procedure is in
      [extender-petanque-validation.md](extender-petanque-validation.md).

## 6. Documentation

- [ ] `CHANGELOG.md` has an entry for the release, with breaking changes called
      out and their migration note.
- [ ] A decision record exists for any architectural, security, or adapter
      choice that would be hard to infer from the code.
- [ ] A validation record in `docs/validation/` covers what was actually
      verified, and says plainly what was not.
- [ ] `docs/migration-plan.md` status reflects reality rather than intent.

## 7. Version

Three files carry the version and must agree:

```bash
npm run check:version
```

It fails when the three disagree, so this is a gate rather than a reading.

## 8. Honest release notes

State what is validated and what is not. Bloom's Extender work is currently
validated at fixture, contract and bench level; live robot acceptance is still
pending. A release note that implies otherwise is the one mistake in this list
that cannot be fixed by a patch release.

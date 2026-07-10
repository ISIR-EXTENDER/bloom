# 2026-07-10 - Frontend/Backend Coherence Review

Status: accepted for tracked fixture/backend contract.

Validator: Codex.

## Scope

This record covers a repository-wide coherence pass between the frontend runtime
fixtures, seeded backend configurations, app-level runtime policies, and backend
default safety allowlists.

This is not a live robot acceptance record. It verifies that the code paths used
by local runtime apps and backend safety policy agree before the next live
simulation or robot pass.

## Command

```bash
npm run validation:frontend-backend
```

Result: passed.

Use `BLOOM_REQUIRE_SEEDED_CONFIGS=1 npm run validation:frontend-backend`
before a local runtime session when seeded configs in `backend/data/configurations`
must exist and match the tracked fixtures.

## Findings Fixed

- `backend/data/configurations/explorer-user-tests.json` had fallen behind
  `tests/fixtures/explorer-user-tests-configuration-bundle.json`, so the local
  runtime app could miss the latest concrete Explorer action topics and payloads.
- Backend default publish allowlists missed Explorer command topics declared by
  the tracked runtime fixture:
  `/explorer/emergency_stop` and `/gripper_controller/commands`.
- Backend default recording allowlists missed topics declared by Sandbox,
  Bloom Debug, and Petanque runtime policies, including visual-servoing,
  ROS logs, and Petanque state-machine topics.

## Contract Covered

The validation command checks:

- tracked runtime fixtures match the corresponding seeded
  `backend/data/configurations/*.json` files when those local ignored files are
  present, with an opt-in strict mode for lab sessions;
- teleop widget targets are allowed by app policy and backend defaults;
- publishing widgets are allowed by app policy and backend defaults for both
  topic and message type;
- app action presets are allowed by app policy and backend defaults;
- app recording-topic policies are compatible with backend default recording
  allowlists;
- local screen navigation command buttons are treated as frontend navigation,
  not backend ROS publishes.

## Remaining Acceptance

The live validation pass still needs to prove that the accepted backend topics
exist in the sourced ROS workspace and that recording/publishing succeeds
against the target simulation or robot stack.

# 2026-07-10 - Petanque Legacy Parity Contract

Status: accepted for fixture/runtime contract.

Validator: Codex.

## Scope

This record covers the migrated Petanque admin fixture that Bloom uses as the
candidate replacement for the legacy Petanque operator screens. It validates the
tracked configuration, runtime publish policy, and backend default allowlists
without requiring a live robot.

This is not a Petanque robot acceptance record. The Petanque stack still needs a
live operator pass before any legacy workflow is retired.

## Command

```bash
npm run validation:petanque-parity
```

Result: passed.

## Contract Covered

The validation command checks:

- the bundle still comes from `legacy-application-screens:app-petanque-admin.json`;
- the Petanque admin app exists with all 12 migrated screens and no empty
  runtime screens;
- teleop joysticks keep the legacy XY/RXRY metadata while publishing mode `3`
  and mode `1` commands to `/teleop_cmd`;
- max velocity, Z/RZ, gripper, visual-servoing, round, capture, throw-alpha,
  throw-gesture, teleop-mode, load-pose, and save-pose controls keep their
  expected topics, message types, and payloads;
- camera and RViz widgets keep the expected stream/source metadata;
- joint, log, Petanque state-machine, velocity, and debug monitor widgets keep
  their expected topics and field paths;
- app runtime policy allows every publishing widget topic and `/teleop_cmd`;
- backend default runtime safety settings still allow the Petanque topics and
  message types needed by the migrated fixture;
- Petanque action presets for `activate_throw` and `open_gripper` still publish
  the expected robot commands.

## Remaining Acceptance

The live Petanque validation record still needs:

- Petanque app launch from the Bloom runtime library on the target device;
- joystick motion through `/teleop_cmd` against the Petanque controller path;
- camera/RViz stream behavior on the lab network;
- state-machine command acceptance for the active Petanque scenario;
- throw gesture and alpha handling by the ROS-side trajectory pipeline;
- pose save/load behavior against real saved-pose storage;
- Bloom Debug topic inspection while the Petanque app runs;
- explicit rollback confirmation to the legacy Petanque workflow until Bloom is
  accepted by operators.

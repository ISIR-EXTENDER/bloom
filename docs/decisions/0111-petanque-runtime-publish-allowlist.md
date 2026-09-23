# 0111 - Petanque Runtime Publish Allowlist

Rewritten 2026-09-23: the original decision widened the backend defaults with
the previous architecture's Petanque topics (`/petanque/throw/*`,
`/visual_servoing/enabled`, `/ui/save_pose`, ...). The rebase retired those,
and this record now states the current policy.

## Context

Bloom enforces two runtime publish guardrails before a ROS command reaches the
robot: app-level `runtime_policy` entries in the configuration bundle, and
backend-level allowlists in `Settings`. Both must name a topic for a control to
publish it.

## Decision

The Petanque app declares, and the backend defaults allow, exactly the
current-architecture surface:

- `/joystick_cartesian_command` as the teleop target;
- `/petanque_state_machine/change_state` for apps-petanque's yasmin state
  machine (teleop, go_to_start, activate_throw, throw, pick_up, stop);
- `/mode_request` for the manager behaviours (home is
  `behaviour/joint_target/home`);
- `/gripper_controller/commands` and
  `/explorer_user_interfaces/rqt_armcontrol/max_linear_speed` for qontrol;
- `/ui/visual_servoing/on` and `/ui/visual_servoing/save` for the
  input_interfaces visual servoing node.

The throw parameters live behind a ROS parameter service
(`/petanque_throw/set_parameters`) that Bloom cannot reach without a parameter
seam, so the app offers no throw tuning rather than publishing into silence.

The environment overrides from the original decision remain:
`BLOOM_ALLOWED_ROS_PUBLISH_TOPICS`, `BLOOM_ALLOWED_ROS_MESSAGE_TYPES`,
`BLOOM_ALLOWED_TELEOP_TARGETS`, `BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND`.

## Consequences

- A correctly configured Petanque control passes both guardrails on the
  standard lab bringup with no environment overrides.
- The backend still rejects unknown robot topics by default; new topics are
  added deliberately to the app policy and backend settings together.

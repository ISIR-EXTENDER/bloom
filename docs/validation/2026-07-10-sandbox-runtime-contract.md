# 2026-07-10 - Sandbox V0.0 Runtime Contract

Status: accepted for fixture/runtime contract.

Validator: Codex.

## Scope

This record covers the Sandbox V0.0 runtime contract that can be validated from
the tracked Bloom configuration fixture without requiring a live robot. It
checks that the runtime app still exposes the controls, topics, message types,
and app policy needed for the next live sandbox simulation pass.

This is not a robot-motion acceptance record. The sandbox simulation still needs
an operator pass to prove controller-side motion and topic feedback.

## Command

```bash
npm run validation:sandbox-runtime
```

Result: passed.

## Contract Covered

The validation command checks:

- Sandbox app exists and keeps the `extender-ui` light theme preset;
- required screens exist:
  `sandbox_control`, `sandbox_teleop_config`, `control_panel`,
  `snake_control`, `visual_servoing`, and `visual_servoing_monitor`;
- translation joysticks publish teleop mode `BOTH` (`mode: 3`) to
  `/teleop_cmd`;
- rotation joysticks publish teleop mode `ROTATION` (`mode: 1`) to
  `/teleop_cmd`;
- max velocity, Z, and RZ sliders use topic bindings for
  `/cmd/max_velocity`, `/cmd/joystick_z`, and `/cmd/joystick_rz`;
- gripper and B1/B2 mode toggles publish the expected `std_msgs` payloads;
- the Snake hold button publishes `{data: true}` on press and `{data: false}`
  on release to `/snake_control/enable`;
- camera preview widgets keep the expected camera topics;
- visual-servoing enable/save controls keep their publish topics;
- visual-servoing monitor widgets watch AprilTag detections, velocity command,
  and error topics;
- Sandbox app policy allows the required publish topics and `/teleop_cmd`.

## Remaining Acceptance

Next validation must run against the sourced sandbox simulation and confirm:

- joystick movement produces non-zero `/teleop_cmd`;
- `/sandbox_controller/velocity_command` changes after teleop input;
- max velocity and Z/RZ sliders publish stable scalar values;
- gripper, mode, and Snake hold publishes are accepted by the runtime backend;
- browser camera preview is usable on the target device;
- monitor widgets receive live visual-servoing samples when the ROS pipeline is
  active.

# 2026-07-10 - Extender Lab Preflight

Status: accepted for lab entry.

Validator: Codex.

## Scope

This record covers the first ordered migration-plan step: prepare the local
Extender lab environment enough to start Bloom from the runtime app library and
continue Sandbox/Petanque validation. It does not accept robot motion, Petanque
parity, or hardware-tablet UX by itself.

## Environment

- Bloom branch: `main` after PR #101.
- Bloom commit: `71b54fa fix(runtime): harden Extender controls (#101)`.
- Extender workspace: `/home/susana/workspace/extender/extender_workspace`.
- Bloom runtime launcher: `scripts/extender-workspace-dev.sh`.
- Runtime URL: `http://127.0.0.1:5173/#/runtime`.

## Commands Run

```bash
npm run validation:extender
```

Result: passed.

The preflight confirmed:

- `sandbox`, `bloom-debug`, and `petanque-admin` runtime configurations exist in
  `backend/data/configurations`;
- Sandbox includes `sandbox/sandbox_control`;
- Sandbox includes `sandbox/visual_servoing_monitor`;
- `snake-mode-toggle.settings.initialValue=false`, so Snake Control opens in
  the expected B2/off state after the recent shared-mode fix;
- Bloom Debug includes `bloom-debug/runtime-topic-monitor`;
- Petanque admin includes `app-petanque-admin/default_live_teleop`;
- Extender setup file exists at
  `/home/susana/workspace/extender/extender_workspace/install/setup.bash`.

```bash
cd /home/susana/workspace/extender/extender_workspace
source /opt/ros/humble/setup.bash
colcon list --names-only
```

Result: passed for package discovery.

Relevant packages present:

- `sandbox_controller`;
- `visual_servoing`;
- `apriltag_detector`;
- `robot_interfaces`;
- `extender_msgs`;
- `tablet_interface`;
- `petanque_bringup`;
- `petanque_state_machine`;
- `petanque_trajectory`;
- `petanque_msgs`.

## Accepted Operating Procedure

Use this procedure before continuing with the next validation slices:

```bash
cd /home/susana/workspace/extender/bloom
npm run validation:extender

cd /home/susana/workspace/extender/extender_workspace
source install/setup.bash

cd /home/susana/workspace/extender/bloom
export BLOOM_CONFIGURATION_DIR="$PWD/backend/data/configurations"
scripts/extender-workspace-dev.sh
```

Then open `http://127.0.0.1:5173/#/runtime` and launch:

1. `Sandbox V0.0`;
2. `Bloom Debug`;
3. `Petanque admin` when the Petanque stack is available.

## Remaining Acceptance

The following items stay pending and must be validated in later records:

- Sandbox runtime control behavior against the sandbox simulation;
- Robin visual-servoing webcam/AprilTag/ROS processing split;
- tablet hardware layout/touch behavior;
- Petanque parity against legacy workflows;
- opt-in rosbag recording in a sourced ROS workspace.

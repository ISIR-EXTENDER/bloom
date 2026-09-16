# Legacy Status And Cleanup Gates

Reviewed 2026-09-16.

Bloom is the active Extender IHM. `extender_ui` is legacy now; this is a product-ownership statement and does not imply
that old repositories must be deleted before live robot acceptance is complete.

## Current Status

| Area | Current role | Status |
| --- | --- | --- |
| Bloom | Builder, app store, operator kiosk, accessible inputs, runtime policy, and ROS adapter surface. | Active IHM; all new IHM work belongs here. |
| `extender_ui` | Historical behavior/configuration reference and emergency UI rollback. | Legacy. Keep available during the acceptance window; do not add new product features. |
| `input_interfaces/tablet_interface` | Existing ROS/input implementation and parity reference for physical controls. | Compatibility/fallback implementation until the equivalent Bloom paths are accepted on hardware. Its status is separate from the `extender_ui` product decision. |
| Petanque app packages | Petanque runtime, messages, state machine, and camera behavior. | Still active only if Petanque remains an expected workflow. Bloom's Petanque app is archived and stays on the legacy command path. |
| Extender low-level ROS packages | Controllers, robot interfaces, simulation, hardware, and messages. | Active dependencies, not replaced or made legacy by Bloom. |
| `sandbox_controller` and `/teleop_cmd` | Old control contract, still used by archived Petanque/rollback. | Legacy adapter path. `cartesian_manager` and `/joystick_cartesian_command` are the current default. |

## Gates For Removing A Legacy Path

Labeling `extender_ui` legacy is complete. Removing, archiving, or making a fallback unavailable requires a separate
decision after these gates:

- the corresponding Bloom workflow is accepted on the target tablet and robot/simulation;
- STOP, release-to-zero, command frame, and relevant assistive inputs have live evidence;
- any unique configuration is imported, published, or intentionally discarded;
- Petanque ownership is decided so `/teleop_cmd` is not removed while still required;
- rollback launch instructions and a final known-good reference are recorded;
- the team agrees on the transition window and archive location.

## What Must Stay Active

Bloom is the IHM above the robot stack. It does not replace `cartesian_manager`, `qontrol_controller`, robot drivers,
message packages, Gazebo/RViz launch files, input hardware packages, or safety hardware. Do not classify those as legacy
because the web operator surface changed.

## Cleanup Process

1. Link the relevant live record from [the end-to-end validation protocol](extender-petanque-validation.md).
2. Confirm no required seed/configuration or unique workflow remains only in the legacy path.
3. Update the legacy repository README with its status, supported rollback scope, and last known-good revision.
4. Keep it available for the agreed transition window.
5. Archive or remove only through an explicit team decision.

Open acceptance and design work is tracked in
[the UX design handoff](ux-design-handoff.md).

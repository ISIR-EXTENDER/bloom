# ROS Simulation End-to-End Run

`npm run e2e:sim` drives Explorer Manager or Kinova Manager in a real browser against the real `cartesian_manager`
stack in simulation, and checks every gesture where it lands: on the ROS graph. Nothing is mocked. It is the gate
between the fixture and contract suites and a bench session with the arm.

`npm run e2e:sim:servo -- --robot kinova` drives the Visual servoing app instead, with the real
`visual_servoing` node and synthetic tags and frames (Kinova only today, the node names its frames); see
[the visual servoing flow record](2026-09-24-visual-servoing-flow.md).

## What It Proves

For the chosen robot, with the API, dashboard, manager, qontrol and controllers all live:

| Check | Evidence |
| --- | --- |
| `library-opens-operator`, `library-opens-bench` | The library opens the app as Operator and as Bench, lands on `manager_drive_operator` / `manager_drive_bench`, and the kiosk reads `READY`. |
| `translation-moves-ee-pose` | A held Translation stroke streams non-zero twists on `/joystick_cartesian_command`, `/ee_pose` moves more than 3 cm, and release publishes a zero twist. The same stroke back returns the arm. |
| `bench-and-operator-publish-same-twist` | The same full-deflection gesture publishes the same twist and frame from both layouts. |
| `gripper-toggle-publishes` | The toggle publishes the robot's own values on `/gripper_controller/commands`: Explorer close `[1.1]` / open `[0.2]`, Kinova close `[0.8]` / open `[0.0]`. |
| `speed-segment-publishes` | Slow and Medium publish their values on `max_linear_speed`. Skipped when nothing but the probe subscribes. |
| `stop-latches-and-hold-resumes` | STOP latches in the backend (`GET /api/v1/runtime/stop` reads stopped and asserted), publishes a zero twist and `behaviour/passthrough`, Translation stays inert while stopped, and the one-second hold resumes. |
| `maintenance-holds-zeros` | Opening maintenance while a keyboard drive is held zeroes the twist, and nothing non-zero reaches ROS while it is open. |
| `joystick-lab-stamps-hybrid-frame` | After Hybrid is selected, the twist on ROS carries `header.frame_id: hybrid_frame`. |
| `positions-go-home-and-release` | Explorer: the first Go home press only arms it, the second publishes `behaviour/joint_target/home` and the manager publishes `/joint_target_command`; Release publishes `behaviour/passthrough`. Kinova: no Go home is offered (cartesian_manager#10), Release still returns passthrough. |
| `robot-feedback-plots` | Robot feedback plots live series and the value strip shows numbers. |
| `bloom-debug-receives-samples` | Bloom Debug fills the joint table from `/joint_states` and renders `/ee_jac` as a 6 by N Jacobian (6 on Explorer, 7 on Kinova). |

Screenshots of each screen go to `<out>/screens`, per-check results to `<out>/results.json`, and process logs to
`<out>/logs`.

## What It Does Not Prove

This is simulation. Explorer runs in Gazebo and the Kinova on ros2_control mock hardware, which mirrors commands back
as state. Neither says anything about real actuators, latency on the lab network, the hardware emergency stop, the
target tablet, a gamepad or switch, or an operator. The Kinova gripper values in particular are unverified on the
Robotiq 2F-85. Hardware acceptance stays in [extender-petanque-validation.md](../extender-petanque-validation.md) and
the release checklist.

The Kinova launch does not spawn `fault_controller`, so Reset fault is not exercised.

## Prerequisites

- The Extender workspace built on ROS 2 Jazzy, next to this repository or pointed to by `EXTENDER_WORKSPACE`.
- `npm ci` at the repository root and `uv sync` in `backend`.
- Chrome, or the Playwright Chromium.
- Explorer: `ros-jazzy-ros-gz-bridge` and the Explorer Gazebo packages, and no other Gazebo simulation running. Gazebo
  transport ignores `ROS_DOMAIN_ID`, so the script refuses to start a second world.
- Kinova: `kortex_description` and `robotiq_description` built in the Extender workspace. They are in
  `extender.repos` (`Kinovarobotics/ros2_kortex` on `jazzy`, `PickNikRobotics/ros2_robotiq_gripper` on `main`); the
  workspace README explains which packages to ignore and why the versions must match. `kortex_description` 0.2.3, the
  copy in the older `kinova_ros2_ws`, writes a `mimic` attribute Jazzy's `ros2_control` refuses, so no controller
  spawns. Packages installed outside the sourced workspace can still be added with `BLOOM_E2E_EXTRA_PREFIX`.

## Commands

A self-contained run starts the simulation on `ROS_DOMAIN_ID=42`, an API on a throwaway SQLite store and a dashboard on
free ports, runs the checks and tears everything down:

```bash
npm run e2e:sim -- --robot kinova
npm run e2e:sim -- --robot explorer --out /tmp/bloom-sim-explorer
```

When a simulation, API and dashboard are already up, drive them instead. Nothing is started or stopped, but the arm
moves and ownership is taken while the checks run:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 npm run e2e:sim -- --robot explorer --reuse-stack
```

`scripts/ros-sim-e2e.sh --help` lists the environment overrides for ports, domain, timeouts and extra prefixes. The
exit status is non-zero when any check fails.

## Explorer Launch Workarounds

`cartesian_manager explorer.launch.py use_simulation:=true` does not bring a usable robot up on its own. The script works
around two issues at runtime, without patching the workspace. Both belong upstream in `explorer_bringup`
(`simulation_base.launch.py`) and should be reported to the explorer_stack owner:

1. **Standalone controller manager blocks the spawn.** The launch starts a `ros2_control_node` next to Gazebo. It cannot
   load `gz_ros2_control/GazeboSimSystem` (the plugin exists only inside Gazebo), logs
   `Waiting for data on 'robot_description' topic to finish initialization`, and waits forever. The robot is spawned
   into Gazebo only `OnProcessExit` of that node, so nothing is ever spawned. The script waits for that log line and
   stops the node; the robot then spawns and Gazebo's own controller manager activates `qontrol_explorer`,
   `gripper_controller` and `joint_state_broadcaster`.
2. **No clock bridge.** The launch sets `use_sim_time` but nothing bridges the Gazebo clock, so qontrol never advances
   and never publishes `/ee_pose`, `/ee_velocity` or `/ee_jac`. The script runs
   `ros2 run ros_gz_bridge parameter_bridge "/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock"`.
3. **Two spawners race for the same joints.** The launch spawns `qontrol_explorer` and
   `forward_position_controller` for the same command interfaces. When the second wins, qontrol stays inactive and
   publishes no pose. The script checks after startup and, if needed, deactivates `forward_position_controller` and
   activates qontrol before waiting for `/ee_pose`.

With both in place `/joint_states` runs at 250 Hz and `/ee_pose` at about 83 Hz. The simulated `/joint_states` carries
NaN velocity and effort for the passive gripper joints; Bloom sends them as `null`.

## Results, 2026-09-17

Both robots ran self-contained, each starting its own simulation, API and dashboard and tearing them down again.

- **Kinova**, on `ROS_DOMAIN_ID=42` with `kortex_description` 0.2.6 and `robotiq_description` built in the workspace:
  12/12 checks passed. Translation moved `/ee_pose` 11.9 cm, the parity twist was `base_link` linear `(0, 1, 0)` from
  both layouts, the gripper sent `[0.8]` and `[0]`, and Bloom Debug showed 13 joint rows and a 6x7 Jacobian.
- **Explorer**, including the two launch workarounds applied by the script: 12/12 checks passed. Go home published the
  `home` joint target from `explorer_params.yaml`, Release returned `behaviour/passthrough`, Bloom Debug showed 12
  joint rows and a 6x6 Jacobian, and Translation moved `/ee_pose` 14.2 cm in an 800 ms stroke.

Findings from these runs, none blocking:

- The maintenance card read "Publish rate 30 Hz, zeros at rest too", but at rest nothing is published: the teleop pump
  sends a six-frame zero tail after release and then stops. With maintenance open and no drive held, ROS saw no twist
  for 1.5 s. The safety property still holds, since an active drive is zeroed on open and the manager expires input
  after 0.2 s, so the check tests that property. The copy now reads "while moving; a release sends zeros".
- Bloom Debug printed manipulability with three decimals, so Explorer's live value of about 8.3e-5 read `0.000`. Values
  under 0.01 now show in exponent form.
- The plot board drew its newest samples a few pixels past the right edge, over the `now` label. They now stop at the
  edge.
- The Kinova launch declares `fault_controller` in `kinova_params.yaml` but never spawns it, so
  `/fault_controller/reset_fault` does not exist in simulation.

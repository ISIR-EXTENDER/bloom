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
| `pivot-left-turns-hand-left` | Pivot held at its left end streams `+angular.z` with zero linear parts, and `/ee_pose` yaws about the base z axis in the positive sense by more than 0.05 rad, with no rotation about x or y. |
| `drive-controls-move-the-hand-as-labelled` | One end of each Drive control (Forward, Right, Up, Tilt up, Roll right): the wire carries one unit component and the hand moves along that base axis, more than 3 cm or 0.05 rad and more than 90% along it, each followed by the stroke back. A robot may name a word that is known not to follow, and the check says so when it starts to. The Kinova settles down first, because mock hardware starts it fully upright. |
| `bench-and-operator-publish-same-twist` | The same full-deflection gesture publishes the same twist and frame from both layouts. |
| `gripper-toggle-publishes` | The toggle publishes the robot's own values on `/gripper_controller/commands`: Explorer close `[1.1]` / open `[0.2]`, Kinova close `[0.8]` / open `[0.0]`. |
| `snake-hold-publishes-pressed-and-released` | The momentary command button end to end: `geometric/snake` on `/mode_request` while Hold snake is held, `geometric/both` on release. |
| `speed-segment-publishes` | Slow and Medium publish their values on `max_linear_speed`. Skipped when nothing but the probe subscribes. |
| `stop-latches-and-hold-resumes` | STOP latches in the backend (`GET /api/v1/runtime/stop` reads stopped and asserted), publishes a zero twist and `behaviour/passthrough`, Translation stays inert while stopped, and the one-second hold resumes. |
| `maintenance-holds-zeros` | Opening maintenance while a keyboard drive is held zeroes the twist, and nothing non-zero reaches ROS while it is open. |
| `joystick-lab-stamps-hybrid-frame` | After Hybrid is selected, the twist on ROS carries `header.frame_id: hybrid_frame`. |
| `positions-go-home-and-release` | Explorer: the first Go home press only arms it, the second publishes `behaviour/joint_target/home` and the manager publishes `/joint_target_command`; Release publishes `behaviour/passthrough`. Kinova: no Go home is offered (cartesian_manager#10), Release still returns passthrough. |
| `robot-feedback-plots` | Robot feedback plots live series and the value strip shows numbers. |
| `builder-authors-a-ros-toggle-and-a-hold-button` | A new app is created through the Builder UI, a toggle and a command button are added from the palette and configured from the inspector alone (topic, message type, labels, ON/OFF and pressed/released payloads), and the screen is saved through the API. |
| `authored-buttons-reach-the-manager` | The authored app opens in the runtime and its two controls put their payloads on `/mode_request`: `geometric/jaco` from the toggle, `geometric/snake` then `geometric/both` from the hold button. The Builder harness (`npm run e2e:builder`, no ROS) authors the same two controls and proves they render inert with the reason. |
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

### Amended 2026-09-24: the Pivot sign

A fourteenth check, `pivot-left-turns-hand-left`, ran on both robots. The wire carried `base_link` angular
`(0, 0, 0.988)` with zero linear parts, and the hand yawed about the base z axis in the positive sense: 0.131 rad on
Explorer in Gazebo over its 800 ms hold, 0.999 rad on Kinova over its 2.5 s hold (qontrol at `a6382c1`, see
[the 7-dof task note](2026-09-24-kinova-qontrol-7dof-task.md)). The rotation had no x or y component on either robot.
So the sign is verified from the slider to the simulated arm; what the operator calls left still depends on where
they sit relative to the base frame, which only the bench can settle. 14/14 on both robots.

### Amended 2026-09-24: every Drive word, and the Explorer's mapping

The Explorer Manager joysticks carried `extender_ui`'s unconfigured identity mapping. The profile driven on the
Explorer, saved from `extender_ui`'s Sandbox teleop config, swaps X and Y and inverts linear X; the seed now
carries it (ADR 0120, amended). A fifteenth check, `drive-controls-move-the-hand-as-labelled`, holds one end of
each Drive control and measures the hand in the base frame, from the pose it started at:

| Word | Explorer (Gazebo, 800 ms) | Kinova (mock hardware, 2.5 s, qontrol `a6382c1`) |
| --- | --- | --- |
| Forward | `linear.x` −1: hand (−0.091, −0.002, 0.001) m, 100% along | `linear.y` +1: hand (0.000, 0.137, 0.000) m, 100% |
| Right | `linear.y` +1: (0.031, 0.075, 0.009) m, 92% | `linear.x` +1: (0.130, −0.015, 0.000) m, 99% |
| Up | `linear.z` +1: (0.000, −0.023, 0.075) m, 96% | `linear.z` +1: (−0.012, 0.003, 0.109) m, 99% |
| Tilt up | `angular.x` +1: (0.186, 0.000, 0.000) rad, 100% | `angular.y` +1: (0.001, 1.093, 0.000) rad, 100% |
| Roll right | `angular.y` +1: (−0.122, 0.127, 0.005) rad, **72%** | `angular.x` +1: (1.053, −0.077, −0.044) rad, 100% |

The Kinova is settled 2.5 s downward first: mock hardware starts the gen3 fully upright, where Up had nowhere to go
(1.5 cm, mostly sideways). The Explorer's Roll right is the one word that does not follow the wire: from its home
pose, 16 cm out and 21 cm up from the base, a +`angular.y` command turns the hand about (−x, +y), run after run,
while the wire is exactly `angular.y`. That is qontrol's compromise at that pose, not the mapping, and the check
names it (`offAxis`) instead of failing every Explorer run on it; it will say so the day it starts to follow.
Before the seed change the identity mapping showed the same kind of thing on Right (+x): 3 cm, mostly −y.

What simulation cannot settle is which base axis is "forward" from the operator's seat; the Explorer mapping is
the one that was driven on the arm, the Kinova's has never been. 15/15 on both robots.

### Amended 2026-09-24: what an author builds reaches the graph

Robin's sheet asked whether a button can be configured entirely from the Builder. Three checks now answer with
the arm running: the shipped Hold snake publishes `geometric/snake` while held and `geometric/both` on release;
a session creates an app through the Builder, adds a toggle and a command button from the palette, fills every
field in the inspector (topic `/mode_request`, `std_msgs/msg/String`, labels, ON/OFF and pressed/released
payloads), saves it through the API, opens it in the runtime and presses both: the manager receives
`geometric/jaco`, then `geometric/snake` and `geometric/both`. Explorer 18/18 on 2026-09-24. Without ROS, the
Builder harness authors the same controls and proves the runtime renders them inert and says why.

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

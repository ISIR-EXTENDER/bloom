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
| `drive-controls-move-the-hand-as-labelled` | One end of each Drive control (Forward, Right, Up, Tilt up, Roll right): the wire carries one unit component and the hand moves along that base axis, more than 3 cm or 0.05 rad and more than 85% along it, each followed by the stroke back. The hand is measured twice: qontrol's `/ee_pose` (the pose of its own integrated command) and the tip frame robot_state_publisher puts on `/tf` from `/joint_states` (the hand the 3D view draws). Both must follow; a horizontal push must not lower the measured hand more than 1 cm, nor take it more than 1.5 cm further from the command, and the joints furthest from qontrol's command are named. A robot may name a word known not to follow reliably. The wire must carry the word's own axis and sign; what fails and what is a WARN is below the table. The Kinova settles down first, because mock hardware starts it fully upright. |
| `bench-and-operator-publish-same-twist` | The same full-deflection gesture publishes the same twist and frame from both layouts. |
| `gripper-toggle-publishes` | The toggle publishes the robot's own values on `/gripper_controller/commands`: Explorer close `[1.1]` / open `[0.2]`, Kinova close `[0.8]` / open `[0.0]`; and the finger in `/joint_states` (`right_finger_joint`, `robotiq_85_left_knuckle_joint`, larger is narrower on both URDFs) travels 0.3 rad the way the word asks within 4 s. Travel the wrong way fails on both robots; no travel fails on the Kinova and is a WARN on the Explorer, whose Gazebo gripper can ignore commands while the arm is still. |
| `snake-hold-publishes-pressed-and-released` | The momentary command button end to end: `geometric/snake` on `/mode_request` while Hold snake is held, `geometric/both` on release. |
| `speed-segment-publishes` | Slow and Medium publish their values on `max_linear_speed`. Skipped when nothing but the probe subscribes. |
| `stop-latches-and-hold-resumes` | STOP latches in the backend (`GET /api/v1/runtime/stop` reads stopped and asserted), publishes a zero twist and `behaviour/passthrough`, Translation stays inert while stopped, and the one-second hold resumes. |
| `maintenance-holds-zeros` | Opening maintenance while a keyboard drive is held zeroes the twist, and nothing non-zero reaches ROS while it is open. |
| `joystick-lab-stamps-hybrid-frame` | After Hybrid is selected, the twist on ROS carries `header.frame_id: hybrid_frame`. |
| `positions-go-home-and-release` | On both arms: the first Go home press only arms it, the second publishes `behaviour/joint_target/home` and the manager publishes `/joint_target_command` naming this arm's own joints (six on the Explorer, seven on the Kinova since cartesian_manager#11); Release publishes `behaviour/passthrough`. |
| `positions-save-and-go-to` | On both arms: **Save this pose** stores the server's live `/ee_pose` (qontrol's commanded tip); the pad moves the hand more than 3 cm away; the first **Go to** press only arms it, the second publishes the saved pose on `/pose_target` in the manager's base frame; the manager's status reports `behaviour/pose_target` and then `behaviour/passthrough` (without a status the check waits for the pose itself, up to 45 s); the commanded `/ee_pose` and the tip measured through TF (base_link to `ft_frame` or `end_effector_link`) are both back within 2 cm and 0.1 rad, the row reads **Within tolerance of Pose N** and the kiosk chip **Going to a pose** has gone. Passthrough is sent at the end whatever happened. |
| `behaviours-screen-offers-both` | The Behaviours screen opens with no widget unavailable on a manager that declares `behaviours.intent_scaling.*` and `behaviours.shared_control.*` (read back with `ros2 param get`), and the intent gauge and the confidence bars say they have no source while both behaviours are off. |
| `intent-scaling-speeds-up-a-held-push` | Speed up with intent publishes `behaviour/intent_scaling`; `/cartesian_manager/intent_scale` starts at `min_scale` and, under a held Forward push, reaches 0.9 or more within 2.2 s over at least 20 samples; the gauge reads it, and the toggle lights **reported by the robot**; with `/cartesian_manager/status`, the status names `behaviour/intent_scaling`. |
| `intent-scaling-off-stops-the-scale` | Switching it off publishes `behaviour/passthrough`, the scale topic goes silent, the gauge says *no source* and the toggle reads off. |
| `behaviour-slider-sets-a-manager-parameter` | The Push start slider sets `behaviours.intent_scaling.min_scale` on the manager, read back with `ros2 param get`. |
| `assist-follows-a-push-towards-a-goal` | The check publishes two goals on `/shared_control/goals` a quarter metre either side of the hand along the axis Forward drives; Assist publishes `behaviour/shared_control`, `/shared_control/confidences` names `agnostic,goal_0,goal_1` and the bars carry those ids, `/shared_control/soft_goal` publishes, and after a 1.5 s push the aimed goal's confidence is above 0.3 and above the other's, on the wire and on its bar; the toggle reads **reported by the robot**, and with `/cartesian_manager/status` the status names `behaviour/shared_control`. |
| `reset-assist-forgets-the-confidences` | Reset assist publishes `behaviour/shared_control/reset`; the manager drops the dynamic goals and reports `agnostic` alone at 1.0, the bars show one row, and Assist stays on. |
| `behaviours-replace-each-other` | Speed up on: the confidences stop and Assist reads off; Assist on: the intent scale stops and Speed up reads off. |
| `stop-ends-a-behaviour` | STOP publishes `behaviour/passthrough`, the confidences stop, and after the resume hold Assist reads off. |
| `leaving-the-app-ends-assist` | With Assist on, closing the operator's browser makes the server publish `behaviour/passthrough` and the confidences stop. |
| `robot-feedback-plots` | Robot feedback plots live series and the value strip shows numbers. |
| `builder-authors-a-ros-toggle-and-a-hold-button` | A new app is created through the Builder UI, a toggle and a command button are added from the palette and configured from the inspector alone (topic, message type, labels, ON/OFF and pressed/released payloads), and the screen is saved through the API. |
| `authored-buttons-reach-the-manager` | The authored app opens in the runtime and its two controls put their payloads on `/mode_request`: `geometric/jaco` from the toggle, `geometric/snake` then `geometric/both` from the hold button. The Builder harness (`npm run e2e:builder`, no ROS) authors the same two controls and proves they render inert with the reason. |
| `a-new-app-arrives-wired` | A guided app from the **Operator controls** starter, with a command button and a gauge added from the palette, saved without touching a single setting. |
| `a-new-app-drives-the-arm` | That app opens with no widget unavailable; its Translation pad moves `/ee_pose` past 3 cm, **Close gripper** puts this arm's closed value on `/gripper_controller/commands`, the speed slider reaches qontrol's limit, the Neutral button reaches `/mode_request`, and the gauge reads the hand live. |
| `lab-opens`, `lab-label-joystick-and-height`, `lab-gesture-pad-publishes`, `lab-gripper-jaco-and-hold`, `lab-speed-and-pivot`, `lab-readers-show-live-values`, `lab-positions-and-camera` | The shipped Widget Lab app, one screen of controls and two of readers, so every kind the palette offers is bound to the simulation and pressed or read: label, joystick, Height slider, gesture pad (a JSON gesture on `/ui/widget_lab/gesture`), gripper toggle (sending the running robot's own close value, 0.8 on the Kinova though the lab is written with the Explorer's 1.1), Jaco button, Hold snake, speed segments, Pivot; gauge, topic plot, plot, value strip, topic echo and event log fed by `/ee_pose` and a Ping on `/mode_request`; a captured pose in the position library and a frame in the camera widget from the probe's `CompressedImage` publisher; the Robot screen is desktop-class, opened at 1920×1080, since the 3D view refuses a tablet screen. |
| `lab-robot-3d-draws-the-running-model` | The 3D robot view fetches the URDF the API serves from the manager's `robot_state_publisher`, resolves its meshes through the API, drives it with `/joint_states`, and draws what the probe publishes on `/widget_lab/markers`: an arrow, a sphere, a line strip with a colour per point, a text label attached to the robot's last link (no marker may be left unplaced), a cube list, and every six seconds the robot's own first mesh as a `MESH_RESOURCE` marker with a three-second lifetime, which must arrive, draw and expire. |
| `lab-robot-3d-shows-the-target-and-the-pose` | `/ee_pose` is drawn as a triad, and the joint target the probe publishes on `/widget_lab/target` four seconds on and four off is drawn as a translucent robot while it lasts and gone on the empty joint state. |
| `lab-robot-3d-draws-the-commanded-motion` | With Height held on the Robot screen the 3D view reports `data-command="moving"` and draws the arrow; on release it reads `still` once the zero twist is out, and the view's count of joint states that moved the model is above one, so a model stuck at the URDF's zero pose fails the run. |
| `bloom-debug-receives-samples` | Bloom Debug fills the joint table from `/joint_states` and renders `/ee_jac` as a 6 by N Jacobian (6 on Explorer, 7 on Kinova). |

**WARN, not FAIL.** Bloom's own direction is strict on both robots: each word's wire axis and sign (pinned per robot) and qontrol's commanded `/ee_pose` going the wrong way always fail. On the Explorer's Gazebo arm (link_3 rests on the ground plane from the launch pose, qontrol integrates its command open loop) a sag, a lag, a short motion, a finger that does not travel, and a measured hand moving against its word *while a joint is more than 0.1 rad short of its command* are WARN lines with their numbers (`BLOCKED` for the last); `scripts/lib/drive-verdict.mjs` holds the rule.
A measured wrong sign with the joints tracking their commands fails on the Explorer too, and on the Kinova (mock hardware, joints equal to the command) every one of these fails.

Screenshots of each screen go to `<out>/screens`, per-check results to `<out>/results.json`, and process logs to
`<out>/logs`.

## What It Does Not Prove

This is simulation. Explorer runs in Gazebo and the Kinova on ros2_control mock hardware, which mirrors commands back
as state. Neither says anything about real actuators, latency on the lab network, the hardware emergency stop, the
target tablet, a gamepad or switch, or an operator. The Kinova gripper values in particular are unverified on the
Robotiq 2F-85. Hardware acceptance stays in [extender-petanque-validation.md](../extender-petanque-validation.md) and
the release checklist.

The Kinova Manager app no longer carries a Reset fault button, since the manager no longer spawns `fault_controller`;
a gen3 fault is cleared from the arm's web page or by a power cycle, which no simulation shows.

## Prerequisites

- The Extender workspace built on ROS 2 Jazzy, next to this repository or pointed to by `EXTENDER_WORKSPACE`.
- `npm ci` at the repository root and `uv sync` in `backend`.
- Chrome, or the Playwright Chromium.
- Explorer: `ros-jazzy-ros-gz-bridge` and the Explorer Gazebo packages, and no other Gazebo simulation running. Gazebo
  transport ignores `ROS_DOMAIN_ID`, so the script refuses to start a second world.
- Kinova Go home: cartesian_manager at #11 (main, `f8bf881`) or later, which ships the gen3's seven-joint home.
- The nine behaviour checks: a manager built with `topic/intent_scaling` and `topic/shared_control` (the combined
  overlay); on a manager without them they report SKIP with the reason and the rest of the run stands.
- Kinova: `kortex_description` and `robotiq_description` built in the Extender workspace. They are in
  `kinova.repos` (`Kinovarobotics/ros2_kortex` on `jazzy`, `PickNikRobotics/ros2_robotiq_gripper` on `main`), imported
  with `WITH_KORTEX=1 ./setup_workspace.sh`; the workspace README explains which packages to ignore and why the versions must match. `kortex_description` 0.2.3, the
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
while the wire is exactly `angular.y`; Right (+`linear.y`) lands anywhere from 80% to 98% along y across runs. That is qontrol's compromise at that pose, not the mapping, and the check
names both (`offAxis`) instead of failing Explorer runs on them; it will say so the day they start to follow.
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

### Amended 2026-09-24: the 3D view as the rviz of a simulation run

The Widget Lab probe now publishes one marker of every kind the view draws, reads the robot's first mesh and its
last link from the latched `/robot_description` topic, labels that link and, every six seconds, publishes the mesh
as a `MESH_RESOURCE` marker that lives three seconds. `lab-robot-3d-draws-the-running-model` requires every marker
placed on a frame the robot knows (`data-markers-unplaced="0"`), the mesh file to arrive (`data-markers-loading="0"`)
and the marker to expire. Explorer 27/27: 21 links, 15 meshes, the label on `left_finger_last_phalanx`, the base
mesh drawn from its `file://` share path with the URDF's 0.001 scale and gone after its lifetime. Kinova 27/27 on
qontrol `a6382c1`: 19 links, 17 meshes, the label on `robotiq_85_right_finger_tip_link`, the gen3 base mesh by
`package://kortex_description` drawn and expired.

### Amended 2026-09-24, later: targets, poses, and a model that had stopped moving

The probe publishes a joint target on `/widget_lab/target` four seconds on and four off, and the Robot screen
names `/ee_pose` as its pose topic. `lab-robot-3d-shows-the-target-and-the-pose` requires the pose drawn, the
target drawn as a translucent twin while it lasts and gone on the empty joint state. The commanded-motion check
now also requires the view's count of joint states that moved the model to be above one. That assertion earned
its place the same night: a redraw-skip that compared a never-seen joint against NaN left the model at the URDF's
zero pose, both robots passed 28/28 regardless, and the screenshot showed the twin lying where the real arm was
while the model stood upright. With the fix: Explorer 28/28, 60 joint states moved the model while Height was
held; Kinova 28/28 on qontrol `a6382c1`, 10 (the gen3 moves at 5 cm/s).

### Amended 2026-09-25: the 3D view on hardware, checked without an arm

The view draws whatever `robot_state_publisher` holds, so the question before a bench is whether the hardware
launch publishes a different robot from the simulated one. It does not. Both launches were expanded offline and
compared:

| | Kinova, `use_fake_hardware` true vs false | Explorer, `simulation:=true` vs `false` |
| --- | --- | --- |
| Links | 19, identical | 21, identical |
| Kinematic joints | 18, identical | 20, identical |
| Visual meshes | 17, identical | 15, identical |

Everything that differs sits inside `<ros2_control>` and `<gazebo>` tags, which the view never reads: the robot
IP, the CAN port, the fake-hardware flags and the gripper's bus parameters. Every mesh the hardware URDFs name
resolves through the API's own resolver and is a file on disk: 17 of 17 for the Kinova as `package://`, 13 of 13
for the Explorer as an absolute `file://` share path. Both forms are now in the dashboard resolver's tests with
the real strings. Neither hardware launch namespaces or renames `robot_state_publisher`, so the default
`BLOOM_ROS_ROBOT_DESCRIPTION_NODE` holds.

What is still unproven on an arm, and cannot be proven without one: that the driver publishes `/joint_states`
for every joint the description declares. Simulation publishes all of them; a real arm may publish fewer, and a
joint it does not report stays where the URDF puts it. The view says so, in the line under it, rather than
drawing a pose it cannot support.

### Amended 2026-09-28: the manager's lasting behaviours

The manager overlay for this run was `topic/behaviours-combined` (intent scaling and shared control merged), sourced
on top of the workspace with `BLOOM_E2E_EXTRA_PREFIX`. Nine checks were added, listed above, and the Go home check
now asserts the joint count on both arms. Explorer 39/39 on qontrol `91309cc`: the held push took the scale from
0.40 to 1.00 over 45 samples, the goal ahead of the hand reached confidence 1.00 after 1.5 s while the other stayed
at 0, and the reset left `agnostic` alone. Kinova 39/39 on qontrol `a6382c1`: the same figures (0.40 to 1.00 over 46 samples, the aimed goal at 1.00), and Go home
reached `/joint_target_command` with the gen3's seven joints.

Both feedback topics stream at 100 Hz while Assist is on; the runtime socket forwards at most 30 samples a second
per topic, and the bars and the 3D view redraw only when a value moved. What the simulation cannot show: whether the
assistance feels right on an arm, and the confidence cone against real joystick noise.

The seeds' presses are pinned by `frontend/apps/bloom-dashboard/src/runtime/seed-dispatch-parity.fixture.json`; a
deliberate seed change is recorded with `BLOOM_WRITE_PARITY_FIXTURE=1 npx vitest run src/runtime/seed-dispatch-parity.test.ts`
from the dashboard package and reviewed as a diff.

### Amended 2026-09-29: save a pose and go back to it

`positions-save-and-go-to` joined, on cartesian_manager `b48ab4d` (pose targets and the status) without the
behaviour overlay, so the nine behaviour checks skip with their reason. After the review the check also measures the
tip through TF, not only qontrol's `/ee_pose`, which is the pose qontrol *commands*.

- **Kinova 43/43** on qontrol `a6382c1` (mock hardware, so measured and commanded agree): Pose 1 saved at (-0.065,
  -0.112, 1.038), verified on `end_effector_link`; moved 19.9 cm away; back in passthrough 13.3 s after the send;
  commanded pose and measured tip both 10 mm and 0.0° from it.
- **Explorer 43/43** on qontrol `91309cc` in the last run: saved at (0.162, 0.041, 0.195), verified on `ft_frame`;
  moved 15.5 cm; passthrough 5.0 s after the send; commanded pose 10 mm and 0.2°, measured tip 8 mm and 2.3° from it.
  Over three runs the Gazebo arm's measured tip ended 8 to 15 mm and 2.3° to 7.3° from the pose while the commanded
  pose was always within the manager's 1 cm, so one run failed the TF assertion (15 mm, 0.128 rad) and the row read
  **Stopped before Pose 1 · measured tip 15 mm and 7° from it**: Bloom said what the arm did. The same run's Widget
  Lab save compared commanded and measured at 0 mm. Whether the gap is Gazebo tracking under gravity or lag the manager
  cannot see was settled with the drive checks' rule (`scripts/lib/drive-verdict.mjs`): it is the Explorer's Gazebo
  lag (arm on the ground plane, qontrol open loop). The commanded-pose arrival stays strict on both robots and the
  measured tip strict on the Kinova; on the Explorer a measured miss is a WARN with the numbers and the joints short
  of their command only while a joint is more than 0.1 rad short (`BLOCKED_JOINT_RAD`), and a failure otherwise. The
  10 mm is the manager's own `position_tolerance`, judged on the commanded pose. The same rule covers a save the gate
  refuses three times. After it, one Explorer run passed 43/43 (measured tip 9 mm and 3.6° from the pose) and one
  failed 42/43: the save gate refused at 10 mm and 3.5° between commanded and measured with no joint more than 0.06
  rad short, so neither a blocked arm nor a WARN: the 1 cm / 0.05 rad save gate was tighter than this sim's ordinary
  tracking. The save band is now 2 cm / 0.1 rad on every robot, the arrival band, as a product rule. With it, two Explorer runs
  passed 43/43: saves verified on the TF tip both times; one run's measured tip ended 12 mm and 5.4° from the pose,
  the other's 17 mm and 6.9° with joint_2 0.12 rad short of its command, a WARN by the rule.

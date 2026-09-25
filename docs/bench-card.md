# Bench Card

One page for a session with a real arm. Every command here is drawn from the pages linked at the bottom; nothing
on this card is new procedure.

> [!CAUTION]
> Bloom's STOP latches the software command path. It does not replace the robot's hardware emergency stop, the
> controller limits, or your lab's safety procedure. **Know where the hardware stop is before you open an app.**

## 1. Before power

- Lab authorization and safety procedure first.
- Hardware emergency stop located, reachable, and tested by whoever is driving.
- Everyone present knows who owns the arm and who calls a stop.

## 2. Bring up the robot

Source the workspace, then launch the manager for the arm you are using.

```bash
cd /path/to/extender_workspace
source install/setup.bash

ros2 launch cartesian_manager explorer.launch.py use_simulation:=false
ros2 launch cartesian_manager kinova.launch.py use_simulation:=false robot_ip:=192.168.1.10
```

Leave it running.

> [!WARNING]
> The simulation workarounds are for Gazebo only. Do not run the clock bridge, and do not run the controller
> handover that deactivates `forward_position_controller`, against a real arm.

## 3. Start Bloom

**After any `git pull`, the launcher installs what the pull added.** If you start the dashboard some other way
and Vite says it cannot resolve an import such as `three`, nothing is wrong with the code: `node_modules` is a
version behind. Run `npm install` in the Bloom repository and start again.


The API joins whatever `ROS_DOMAIN_ID` its shell was sourced into, and it reads its settings once at startup, so
**the environment has to be right before the process starts**. One API process per robot.

For Explorer:

```bash
cd /path/to/bloom
EXTENDER_WORKSPACE=/path/to/extender_workspace \
BLOOM_ROBOT_NAME=Explorer \
BLOOM_ROS_COMMAND_FRAME_ID=base_link \
BLOOM_ROS_EE_FRAME_ID=effector_frame \
scripts/extender-workspace-dev.sh
```

For Kinova, change the last two values:

```bash
BLOOM_ROBOT_NAME=Kinova \
BLOOM_ROS_EE_FRAME_ID=effector_frame \
```

**The gripper camera starts with the launcher.** With `BLOOM_ROBOT_NAME` set it picks the arm's camera through
`camera_interface`: the Explorer's USB camera (or the first webcam when it is not plugged in), or the Kinova's
integrated camera through `kinova_vision`, which needs the arm on its network. The image reaches the camera test apps
on `/camera/color/image_raw/compressed`. A camera already publishing there is left alone; `BLOOM_CAMERA=none` skips
it, `BLOOM_CAMERA=usb_cam` forces the webcam, and the camera's log is `backend/data/camera.log`.

`BLOOM_ROS_EE_FRAME_ID` names the arm's own end-effector frame. Get it wrong and Bloom offers a frame the manager
silently discards, which looks exactly like a broken web stack.

**Driving from a tablet** — bind the dashboard to the network so the launcher allows the tablet's origin:

```bash
LAN_IP="$(hostname -I | awk '{print $1}')"

BLOOM_API_HOST=127.0.0.1 \
BLOOM_FRONTEND_HOST=0.0.0.0 \
BLOOM_PUBLIC_HOST="${LAN_IP}" \
scripts/extender-workspace-dev.sh
```

Open the printed `http://<lan-ip>:5173` on the tablet. The runtime socket refuses a page whose origin it does not
know; the launcher allows the loopback origins and `http://<BLOOM_PUBLIC_HOST>:<port>` for you. A device reaching
the dashboard under any other name, or a port Vite moved to, is refused until that origin is added.

**Running both arms** means two API processes: different ports, and their own `BLOOM_ROBOT_NAME` and
`BLOOM_ROS_EE_FRAME_ID`. One backend instance serves one robot.

**Watching the arm in Bloom instead of rviz.** Bloom Debug's Robot view screen, like Widget Lab's Robot screen
(desktop screens; the palette refuses the 3D view on a tablet), draws the robot the manager runs with: the API reads
`robot_description` from `/robot_state_publisher` on its own domain (`BLOOM_ROS_ROBOT_DESCRIPTION_NODE` to change the
node) and serves the meshes itself, so the laptop needs no rviz and no mesh files of its own. Open it before or after
the launch: the view asks again every three seconds until the description exists. Anything a node publishes as a
`visualization_msgs/msg/MarkerArray` on `/goal_markers` (Bloom Debug) or `/widget_lab/markers` (Widget Lab) is drawn
on the robot as rviz would draw it; a blue arrow and arc show what the runtime is commanding. Double-click the view or
press Frame to frame the robot again. Both screens also draw `/ee_pose` as a triad: if it sits on the model's tool
triad, the manager's frames and the description agree, which is the check in section 4 made visible. A joint target
such as Load home shows as a translucent copy of the robot until the manager cancels it.

## 4. Check the frames before anything moves

The manager does no TF lookup and silently skips an unknown frame, so this is the fastest class of failure to
rule out.

```bash
ros2 param get /cartesian_manager frames.default_input_frame_id
ros2 param get /cartesian_manager frames.base_frame
ros2 param get /cartesian_manager frames.ee_frame
ros2 param get /cartesian_manager frames.hybrid_frame
```

Confirm the link reports subscribers rather than `MISSING`:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/ros/topics/status
```

## 4b. If a physical joystick is on the bench

Bloom reads any gamepad the browser can see, and publishes it to the same topic `joystick_mapper` uses.
`cartesian_manager` keeps one command per input source and replaces it, so the two overwrite each other and a
centred stick streams zeros over Bloom's twist. Their axis maps also disagree: the bench's three-axis stick reads
axis 2 as `linear_z`, Bloom's default reads it as `angular.x`.

**Pick one.** Either stop `joystick_mapper`, or close Bloom's browser on the machine the stick is plugged into.

```bash
ros2 topic info /joystick_cartesian_command --verbose   # a publisher means joystick_mapper is live
```

The kiosk bar shows a gamepad chip whenever Bloom can see a pad. If a Z push produces rotation, this is why.

## 5. Before touching a control

Read the kiosk bar. Confirm four things:

1. It names the app and screen you meant to open.
2. The chip reads `READY`.
3. The command frame is the one this task needs.
4. The role is yours.

`READY` describes the link between the browser and the backend. **It is not proof that the robot is listening.**

Then confirm STOP itself, before relying on it:

- STOP latches across a reload and across a second runtime client.
- `/cartesian_command` returns to zero when you release a control.

If STOP does not assert, treat that as a failure of the software path and use the hardware emergency stop.

## 6. First motion: the Pivot sign

**Do this before anything else moves**, at the slowest speed segment, with a hand on the hardware stop.

Bloom publishes Pivot's left end as `+angular.z`, meaning the hand turns **left**. That sign is verified on the ROS
wire and on both simulated arms, whose hand yaws positively about the base z axis; never on an arm, and whether
that reads as left from the operator's seat is the bench's call. Nudge Pivot left and watch the hand.

- Turns left — the sign is correct. Record it.
- Turns right — stop, and record it. The sign is inverted and the operator guide's claim is wrong.

## 7. What only a real arm can prove

Work through these deliberately; none of them can be tested any other way.

| Check | Why it needs hardware |
| --- | --- |
| Pivot sign | Above. Verified in simulation about the base z axis, never observed on an arm. |
| Gripper values | Explorer publishes close `[1.1]` / open `[0.2]`; Kinova close `[0.8]` / open `[0.0]`. The Kinova values are unverified on the Robotiq 2F-85, and the jaws actually close this time. |
| Neutral, Jaco, momentary Snake | Shaping modes against the real controller chain. |
| Speed limits | The simulation check skips when nothing subscribes. On hardware qontrol should subscribe, so a skip here is a red flag. |
| Reset fault (Kinova) | The simulation launch never spawns `fault_controller`, so this has never been exercised at all. It is the gen3's recovery path. |
| Bloom Debug joint table | A real arm publishes a different joint set than the simulation did. |
| The tablet, gamepad or switch | Together, on the device, with the profile the operator will actually use. |
| The 3D view against the real arm | The description and meshes are identical to the simulated ones, checked offline, so the robot draws the same. What is unproven is `/joint_states`: simulation publishes every joint, gripper included, and a real arm may publish fewer. A joint the driver does not report stays where the URDF puts it, and the line under the view says how many of the model's joints are driven. Compare the drawn pose with the arm once before trusting it. |

## 8. Known-absent — do not chase these

- **Kinova has no Go home button.** `cartesian_manager`'s Kinova parameters still carry Explorer's six-joint home
  target, and joint 4 at 2.97 rad is outside the gen3 limit of 2.57 rad. Bloom removed the button on purpose and
  returns it when that is corrected upstream (`cartesian_manager#10`). **Do not hand-edit `kinova_params.yaml`
  mid-session to get it back.**
- **Saved poses live in the API process and are lost when it restarts.** Export them before stopping it.
- **A saved pose cannot be replayed from Bloom** until the manager restarts with it, because the manager only
  moves to targets it loaded at start.
- **A second runtime tab is inert until it claims control.** That is ownership working, not a bug.
- **Spanish and French wording** has not had a native speaker's review. Keep a participant session in English.

If the operator is new to Bloom, the practice tour is worth five minutes first: hold **⋯** for 1.5 seconds, then
**More > Practice tour**. It commands no robot.

## 9. If Bloom publishes but the arm does not move

Isolate outside the web stack before debugging it:

```bash
ros2 topic pub --times 12 --rate 10 /tablet_cartesian_command geometry_msgs/msg/TwistStamped \
  "{header: {frame_id: 'base_link'}, twist: {linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}}"
```

Then watch `/cartesian_command`. If it also stays at zero, the blocker is in the ROS or controller path rather
than Bloom.

## 10. Write it down

This is the point of the session. Add a dated record under [`docs/validation/`](validation/) saying what was
confirmed, what was corrected, and what was not reached. A fixture, browser, bench or simulation result must
never be promoted to a live hardware claim without it.

Findings that belong to another repository — `cartesian_manager`, `explorer_stack` — go upstream as issues.

---

Sources, if you need the full version of any step: [Operate safely](tutorials/operate-safely.md) ·
[Getting started](tutorials/getting-started.md) · [Deployment and lab hardware](deployment.md) ·
[Extender and Petanque validation](extender-petanque-validation.md) ·
[The operator runtime guide](operator-runtime.md)

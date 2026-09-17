# Getting Started

From a fresh clone to a simulated arm moving under your hand. Allow about an hour the first time, most of it the ROS
workspace build.

The tutorial has two halves. Part one runs Bloom on its own, with no robot and no ROS, so you can see the whole
interface safely. Part two attaches it to a simulated Explorer or Kinova arm and drives it.

> [!CAUTION]
> Finish this tutorial in simulation before you point Bloom at a real arm. Bloom's STOP latches the software command
> path; it does not replace the robot's hardware emergency stop, the controller limits, or your lab's safety
> procedure.

## Part 1 — Bloom on its own

### 1. Install

You need Node.js 24 LTS, npm 11 or newer, Python 3.10 to 3.12, and [`uv`](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/ISIR-EXTENDER/bloom.git
cd bloom
npm install
cd backend
uv sync
cd ..
```

`node --version` must print `v24.15.0` or newer. An older Node starts the dev server but cannot run the test suites.

### 2. Start the API

In one terminal:

```bash
cd backend
make run
```

It listens on `127.0.0.1:8000`. On its first start it imports the applications committed under
`backend/seed/applications/` into a new SQLite store at `backend/data/bloom.db`, so you get the same app library as
everyone else. Check it from a third terminal:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
```

### 3. Start the dashboard

In a second terminal, from the repository root:

```bash
npm run dev
```

### 4. Open it

Visit <http://127.0.0.1:5173>. You should land on a page headed **Give the gesture back.** with **Open Runtime**,
**Open Builder** and **Get started**, and a top navigation of **Home**, **Builder**, **Runtime** and **Help**.

Choose **Open Runtime**. The left column, **Apps on this robot**, lists the shipped applications: Explorer Manager,
Kinova Manager, Sandbox V0.0, Explorer User Tests, Petanque admin, Bloom Debug and the webcam visualizer. Select
**Explorer Manager**, choose **Operator** in the **Open as** rail, and press **Open as Operator**.

You are now in the kiosk. The 44 px bar across the top reads the app name, the screen title, a status chip, the command
frame, the publish rate and the role. Controls that need a ROS seam the backend does not have are visible but inert and
say why. That is the correct behavior with no robot attached, and it is the point of running this part first: you can
open every screen, hold **⋯** for 1.5 seconds to reach Maintenance, press **STOP** and hold to resume, without anything
being able to move.

**How to tell it worked:** the kiosk bar shows `READY`, and a joystick you drag returns to centre when you let go.

Stop both processes with `Ctrl+C` when you are done. To go further in the Builder now, follow
[Build your first app](build-your-first-app.md).

## Part 2 — Drive a simulated arm

### 5. Build the Extender workspace

Bloom does not launch a robot. The ROS workspace does, and Bloom talks to it.

```bash
cd /path/to/extender_workspace
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
source install/setup.bash
```

Ubuntu 24.04 and ROS 2 Jazzy are the baseline. The workspace README covers importing the sub-repositories and the
build order.

### 6. Launch one robot

For Explorer in Gazebo:

```bash
cd /path/to/extender_workspace
source /opt/ros/jazzy/setup.bash
source install/setup.bash
ros2 launch cartesian_manager explorer.launch.py use_simulation:=true
```

> [!NOTE]
> On the current Jazzy install this launch does not bring up a usable arm by itself. A standalone `ros2_control_node`
> blocks the Gazebo spawn, and nothing bridges the Gazebo clock. Both belong upstream in `explorer_bringup`; the two
> workarounds are written out in [the simulation run](../validation/ros-sim-e2e.md), and `npm run e2e:sim` applies them
> for you.

Or, for a Kinova gen3 on mock hardware:

```bash
ros2 launch cartesian_manager kinova.launch.py use_simulation:=true
```

Leave that terminal running.

### 7. Start Bloom against that robot

One launcher starts the ROS-enabled API and the dashboard together. For Explorer:

```bash
cd /path/to/bloom
EXTENDER_WORKSPACE=/path/to/extender_workspace \
BLOOM_ROBOT_NAME=Explorer \
BLOOM_ROS_COMMAND_FRAME_ID=base_link \
BLOOM_ROS_EE_FRAME_ID=ft_frame \
scripts/extender-workspace-dev.sh
```

For Kinova, change the last two values:

```bash
EXTENDER_WORKSPACE=/path/to/extender_workspace \
BLOOM_ROBOT_NAME=Kinova \
BLOOM_ROS_COMMAND_FRAME_ID=base_link \
BLOOM_ROS_EE_FRAME_ID=effector_frame \
scripts/extender-workspace-dev.sh
```

`BLOOM_ROS_EE_FRAME_ID` names the arm's own end-effector frame. Get it wrong and Bloom offers the operator a frame the
manager will silently discard, so it is worth checking against the manager's configuration.

The launcher sources the workspace, starts the API on `8000` and the dashboard on `5173`, and stops both on `Ctrl+C`.

**How to tell it worked:** the ROS topic status reports subscribers rather than `MISSING`.

```bash
curl -fsS http://127.0.0.1:8000/api/v1/ros/topics/status
```

### 8. Drive

Open <http://127.0.0.1:5173>, choose **Open Runtime**, select the Manager app that matches the robot you launched, and
press **Open as Operator**.

Before you move anything, read the kiosk bar: the app, the screen, `READY`, the command frame, the publish rate, the
role. Then drag the **Translation** pad and let go.

In another sourced terminal, watch what left Bloom and what the manager did with it:

```bash
source /opt/ros/jazzy/setup.bash
source /path/to/extender_workspace/install/setup.bash
ros2 topic echo /joystick_cartesian_command
ros2 topic echo /cartesian_command
```

Both should carry a non-zero twist while you hold the pad and return to zero when you release. The path is:

```text
browser control -> Bloom WebSocket -> ROS adapter -> /joystick_cartesian_command
                -> cartesian_manager -> /cartesian_command
```

**How to tell it worked:** the arm moves in Gazebo or RViz, `/cartesian_command` returns to zero on release, and the
publish rate in the kiosk bar reads `publishing · N Hz` while you hold and `zeros held` after.

If the arm does not move but `/joystick_cartesian_command` does, the problem is below Bloom: check the manager and the
controllers. If neither topic carries anything, check that the kiosk bar reads `READY` rather than `NOT IN CONTROL` —
another browser tab may still own the robot.

### 9. Check the same things a machine checks

The end-to-end suite drives both robots in a real browser against the real manager and verifies every gesture on the
ROS graph, with no mocks. It starts its own simulation, API and dashboard on a throwaway store and tears them down:

```bash
npm run e2e:sim -- --robot explorer
npm run e2e:sim -- --robot kinova
```

Screenshots land in the output directory, results in `results.json`, and the exit status is non-zero if any check
fails. [The simulation run](../validation/ros-sim-e2e.md) lists what each check proves and, just as importantly, what
simulation does not prove.

## When you move to a real arm

Use your lab's authorization and safety procedure first, then replace the simulation launch with the hardware one.
Nothing on the Bloom side changes.

```bash
ros2 launch cartesian_manager explorer.launch.py use_simulation:=false
ros2 launch cartesian_manager kinova.launch.py use_simulation:=false robot_ip:=192.168.1.10
```

Work through the pre-session checks in
[Extender and Petanque end-to-end validation](../extender-petanque-validation.md) before an operator session, and read
[Operate safely](operate-safely.md) with whoever will be driving.

## Where to go next

- [Build your first app](build-your-first-app.md) — make your own screen instead of running a shipped one.
- [Operate safely](operate-safely.md) — the operator's page: roles, STOP, maintenance, settings.
- [The operator runtime guide](../operator-runtime.md) — the full behavioral contract behind both.
- [Deployment and lab hardware](../deployment.md) — environment variables, the same-Wi-Fi recipe, the tablet.
- [Extender and Petanque validation](../extender-petanque-validation.md) — what to run before a real arm.

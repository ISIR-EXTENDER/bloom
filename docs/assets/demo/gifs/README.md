# Demo GIFs

Each GIF shows one of Bloom's main steps with its cause and effect side by side: the operator screen on the left
(Explorer Manager or Kinova Manager, opened as the Operator on a 1280×720 tablet viewport, with a visible cursor and
a lower-third note for each sub-step) and the live robot model on the right (Bloom Debug's **Robot view**, or the
Widget Lab's **Robot** screen for the scenes that draw the shared-control goals), both captured from the same
simulated `cartesian_manager` stack at the same time. Nothing is mocked: every press goes through the API to ROS and
the model on the right is drawn from `/joint_states`.

Format: 1600 px wide, 12 fps, a caption bar with the step name, under 20 s each. Only the GIFs are committed; the
recorder also writes the `.mp4` of each scene at full quality and three PNG frames per scene (start, middle, end)
under `frames/`, which stay out of git.

## Scenes

The GIFs shipped here, the ones the README and the tutorials embed:

| GIF | Robot | What it shows |
| --- | --- | --- |
| `explorer-open.gif` | Explorer | The Runtime library: pick Explorer Manager, the Operator role, Open; the kiosk reads READY. The model on the right is already live. |
| `explorer-forward.gif` | Explorer | The Translation pad pushed Forward and held: the hand moves forward in the 3D view; on release the pad springs back and the hand stops. |
| `explorer-gripper.gif` | Explorer | Close gripper: the fingers close on the model; Open gripper: they open. |
| `explorer-stop.gif` | Explorer | STOP: the controls are inert while stopped (a push moves nothing), the one-second hold resumes, the same push moves the hand again. |
| `explorer-assist-to-goals.gif` | Explorer | Two goals published on `/shared_control/goals` (PoseArray, base_link); Assist to goals ON: the confidence bars appear and the goals are drawn in the 3D view; a push toward one goal fills its bar; Reset assist forgets them. |
| `explorer-settings-palette.gif` | Explorer | Settings from the maintenance menu: the Dark palette recolours the whole screen, then back to the app's own palette, Save and resume. |
| `explorer-settings-scan.gif` | Explorer | Input method Scan, Save and resume: the scanning highlight steps through the Drive controls and the SWITCH button activates the current one. |
| `kinova-open.gif` | Kinova | The library opens Kinova Manager as the Operator, READY, with the gen3 live on the right. |
| `kinova-forward.gif` | Kinova | The Translation pad pushed Forward and released: the gen3's hand moves along base +y (the seed's Forward) and stops; from the home pose its fingers point along +x, so the hand slides sideways to them, away from the camera. |
| `kinova-gripper.gif` | Kinova | Close and Open on the Robotiq 2F-85, framed on the hand: the fingers close and open on the model. |
| `kinova-go-home.gif` | Kinova | Go home on the gen3: the manager's seven-joint home target as the translucent twin, and the arm reaching it (within 0.05 rad in about 4 s). |

To re-record before they ship: `explorer-height-pivot`, `explorer-speed-up-intent`, `explorer-go-home`,
`explorer-builder-create`, `explorer-builder-place` and `explorer-new-app-drives`.

## Re-recording

The stack and the recorder are two scripts, so a stack can be kept alive across recording runs.

```bash
# 1. The simulation, the API and the dashboard, plus a second API/dashboard pair for the robot-view page
#    (the runtime control lease is per API process, and a Bloom Debug page on the operator's API would hold it).
S=/path/to/scratch
EXTENDER_WORKSPACE=../extender_workspace \
BLOOM_E2E_EXTRA_PREFIX=/path/to/cartesian_manager-with-behaviours/install/cartesian_manager \
  bash scripts/demo-gifs-stack.sh --robot explorer --out "$S/stack-explorer"
# ... prints READY and writes $S/stack-explorer/stack.env; `touch $S/stack-explorer/stop` ends it.

# 2. In another shell, with the same ROS environment sourced and ROS_DOMAIN_ID=42:
BLOOM_DASHBOARD_URL=http://127.0.0.1:5180 BLOOM_VIEW_DASHBOARD_URL=http://127.0.0.1:5181 \
  node scripts/record-demo-gifs.mjs --robot explorer [--scenes open,forward,gripper] [--out docs/assets/demo/gifs]
```

Scene names: `open`, `forward`, `height-pivot`, `gripper`, `speed`, `stop`, `go-home`, `speed-up-intent`,
`assist-to-goals`, `settings-palette`, `settings-scan`, `builder-create`, `builder-place`, `new-app-drives`.
`--compose-only` re-encodes the scenes of a previous `--work` directory without recording. The Kinova set recorded
here was `go-home` first (mock hardware starts the gen3 upright with its hand out of view), then
`open,forward,gripper` from the home pose, on `ROS_DOMAIN_ID=43` with qontrol at `a6382c1`.

Prerequisites, as for `npm run e2e:sim` (see `docs/validation/ros-sim-e2e.md`): the Explorer runs in Gazebo (one
world per machine, `ROS_DOMAIN_ID=42`, an empty domain), the Kinova on mock hardware with `kortex_description` and
`robotiq_description` built. The behaviour scenes need a `cartesian_manager` that declares
`behaviours.intent_scaling.*` and `behaviours.shared_control.*` (the combined `topic/intent_scaling` +
`topic/shared_control` build). The Kinova run needs `qontrol_controller` at `a6382c1`
(`git -C src/qontrol_controllers checkout a6382c1 && colcon build --symlink-install --packages-select qontrol_controller`
from the workspace), restored to `91309cc` and rebuilt afterwards.

The recorder keeps the Chrome screencast of both pages, cuts each scene by its markers, resamples both sides to
12 fps, composes them with ffmpeg (`hstack`, caption bar, `libx264`) and encodes the GIF with a palette pass
(`palettegen`/`paletteuse`). `ffmpeg` and the DejaVu fonts must be installed.

## Notes from the recording (2026-09-28)

- The Explorer's fingers did not move in the 3D view until `robot-3d-scene.tsx` stopped applying joint states to
  mimic joints (urdf-loader re-multiplies and clamps a value set on a mimic; the master drives them). That fix and
  its regression test (`robot-3d-model.test.ts`) came out of `explorer-gripper.gif`.
- Go home in the Explorer simulation: qontrol's joint target moves at about 0.14 rad/s, and from some poses it does
  not move at all (joint_3 near +2.97 with home at -2.4: the minimal-angle path runs through the joint limit). A
  manager/qontrol matter, not Bloom's; record the scene right after a fresh launch.
- Gazebo's Explorer gripper ignores commands for the first minutes after launch (the finger state snaps between 0
  and 1.05); it settles after the arm has moved for a while.
- Two runtime sessions: the viewer pair exists because the first session to claim the control lease keeps it, and
  a session that never gets it never reads READY.

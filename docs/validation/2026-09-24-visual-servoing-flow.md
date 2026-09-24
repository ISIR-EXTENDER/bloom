# Visual servoing flow: camera_interface review and the Bloom app

Date: 2026-09-24

Susana asked for a review of `camera_interface` and of how it closes the visual servoing gap, then
a Bloom app and end-to-end tests that confirm Robin's flow: see the gripper, drive to a tag, save the
view, let the servoing node bring the arm back. It has to work with a webcam and on the Explorer, not
only with the Kinova camera.

## What camera_interface closes

`camera_interface` (input_interfaces, branch `feat/camera-interface` on the ssrpo fork) is one launch
file that puts any camera on one set of names: `/camera/color/image_raw`, `/camera/color/camera_info`
and `/camera/color/image_raw/compressed`, whatever the driver (`usb_cam` for the Explorer camera or
any webcam, `camera_ros`, `kinova_vision` included rather than respawned, `none` for a camera already
up). It also exports `apriltag_remappings()`, the two remaps `apriltag_detector` needs because it
subscribes `/image_raw` and `/camera_info` absolutely.

So it closes the **camera side** of the loop: any camera → the detector, and any camera → Bloom's
camera widget, which reads the compressed convention topic on its own socket (ADR 0137). That is what
"a webcam and the Explorer" needed on the image path, and it needs no change in Bloom.

## What it does not close

Two things stay open, neither of them Bloom's to fix alone:

1. **The manager never reads the servoing output.** `visual_servoing.cpp` publishes
   `/visual_servoing/velocity_command`; both manager configs name `/visual_servoing_cartesian_command`
   as the servoing input and declare only `joystick` in `inputs.sources`. Either the node's output is
   remapped onto the manager's name and the source declared, or the manager config points at the
   node's topic. The e2e below records this as a skip, with the reason, until the team decides.
2. **The node's frames are the Kinova gen3's.** `end_effector_link`, `camera_link` and `base_link`
   are literals in the node, and the only hand-eye file is the Kinova camera's. The Explorer has no
   `end_effector_link`, so the node aborts on it. A proposal that reads `ee_frame`, `camera_frame`
   and `base_frame` from the hand-eye file (the Kinova file already carries the first two) and adds
   an Explorer entry point sits on the ssrpo fork of input_interfaces, branch
   `feat/visual-servoing-frames`; its PR was closed on purpose and Susana will take it up with Robin
   after his tests, since the node is his. Two facts for that discussion: the Explorer's tool frame
   in TF is `ft_frame` (the manager's `effector_frame` is a command label, not a published frame),
   and the Explorer hand-eye transform still has to be calibrated on the bench.

Also worth knowing: the node emits its velocity in the base frame at 30 Hz, saturated at 0.2 m/s,
only while `/ui/visual_servoing/on` is true, and a zero twist while no tag is seen. Bloom's STOP now
publishes `/ui/visual_servoing/on: false` when it latches, so a latched STOP also silences the node.

## The Bloom app

`backend/seed/applications/visual-servoing.json`, three full-panel screens with the reserved STOP
region, contract `scripts/visual-servoing-app-contract.mjs`:

| Screen | Role | What it holds |
| --- | --- | --- |
| Servo | Operator | Gripper camera (`/camera/color/image_raw/compressed`), the Visual servoing toggle (`/ui/visual_servoing/on`), Save this view (`/ui/visual_servoing/save`), the tag list, a servo output plot, and three nudge sliders. |
| Approach | Bench | Gripper camera, the manager's input gates (`inputs.joystick.enabled`, `inputs.visual_servoing.enabled` as live parameters), Height, Translation and Rotation pads through `cartesian_manager`, the qontrol speed limits. |
| Monitor | both | Tag detections, the velocity and error plot with its picker, the velocity strip. |

The image pipeline stays in ROS: no raw image topic reaches a monitor or a recording, as the July
contract requires.

## End-to-end evidence

`npm run e2e:sim:servo -- --robot kinova` starts the simulation, the **real** `visual_servoing`
node, unchanged, with its saved tag goals, the API, the dashboard,
and a probe that publishes a synthetic tag (id 2, a little off its saved pose) and a synthetic camera
frame, since Gazebo has neither. Bloom, the manager and the node are real.

| Check | Evidence |
| --- | --- |
| `library-opens-servo` | The app opens as Operator on `servo`, READY. |
| `gripper-camera-shows-frames` | The camera widget renders frames from the convention topic. |
| `tag-detections-reach-the-monitor` | The tag list shows id 2 from `/tag_detections`. |
| `enable-reaches-the-node-and-it-answers` | The toggle publishes `on: true`; the node answers with a non-zero `/visual_servoing/velocity_command` and an error on `/visual_servoing/error_TAGtoTAGd`. |
| `monitor-shows-the-servo-numbers` | Monitor's velocity strip shows the live numbers, then the app returns to Servo. |
| `manager-reads-the-servo-velocity` | **Skipped**, with the reason: the manager does not subscribe to the node's topic. |
| `save-writes-the-tag-goal` | Save publishes on `/ui/visual_servoing/save` and the node rewrites tag 2 in `saved_tag_goals.yaml`. |
| `stop-switches-servoing-off` | STOP publishes `on: false`, the node goes quiet, the hold resumes. |
| `approach-screen-drives-through-the-manager` | Opened as Bench, a Translation stroke reaches `/joystick_cartesian_command`. |
| `servo-input-gate-sets-the-manager-parameter` | The Servo input toggle flips `inputs.visual_servoing.enabled` on the manager, then back. |

Results on 2026-09-24, manager `d9a1fa5`, qontrol `91309cc`, the team's `visual_servoing`:
**Kinova 9/9** (8 pass, 1 skip). The scenario refuses the Explorer today, out loud, because the node
names the gen3's frames; with the proposal branch above it also reached 9/9 on the Explorer, which is
the evidence for that discussion. Each run leaves `results.json` and `screens/` under
`/tmp/bloom-ros-sim-e2e-<robot>-<stamp>/`.

## Still to do on the bench

- Robin: the node's frames from its hand-eye file, then an Explorer hand-eye calibration.
- Close the loop on the servoing side: publish where the manager listens and declare the source.
- Run the flow with a real tag and `camera_interface driver:=usb_cam` on the Explorer, then
  `driver:=kinova_vision` on the gen3; this record turns from simulation into hardware evidence then.

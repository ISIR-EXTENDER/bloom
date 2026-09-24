# The 3D View Against rviz, 2026-09-24

Why Bloom draws the robot itself instead of putting rviz on the screen. Measured on the Kinova simulation
(`cartesian_manager kinova.launch.py use_simulation:=true`, fake hardware, `/joint_states` at 30 Hz, the Widget
Lab probe publishing its six markers on `/widget_lab/markers`), on the Extender laptop (Intel Arc Graphics, 22
cores, Ubuntu 24.04, ROS 2 Jazzy), both viewers drawing the same robot and the same markers at the same window
size, 1396 by 846. Numbers come from `bench-3d.mjs` in the session scratchpad: process trees sampled through
`/proc` over 30 seconds still and 30 seconds while the arm drove at `+z` under `geometric/both`.

## What "adding rviz to Bloom" would mean

rviz2 is a Qt desktop application with its own OpenGL context and its own DDS participant. There are three ways to
put it on a Bloom screen, and each one is a different product:

| Option | What the tablet gets | What it costs |
| --- | --- | --- |
| rviz2 beside the browser | Nothing: a second window on the laptop only. | A desktop with Qt, OpenGL and the robot's mesh packages installed, on the robot's DDS domain. |
| rviz2 streamed as video | A video of a window: no touch, no orbit, a second's latency, a screen recorder's CPU. | An X server, a capture pipeline (`ffmpeg` or GStreamer), and the same desktop as above. |
| A web port of rviz (Foxglove's 3D panel, webviz) | A second web app in an iframe, with its own bridge to ROS. | A `rosbridge` or Foxglove bridge exposing topics to the browser beside Bloom's API, a second theme, a second permission model. |

None of them draws the operator's own command, none of them respects Bloom's device classes, and every one of
them needs a DDS-side process per viewer. The measured comparison below is against the first option, the only one
that keeps rviz's own interaction.

## Measured

The first run, before the night's fixes, on the Widget Lab Robot screen (the 3D view, a camera widget, the
position library and a Height slider) in a headed Chromium at 1920 by 1080:

| | Bloom's 3D view (whole browser) | rviz2 |
| --- | --- | --- |
| Time to a drawn robot | 1.0 s from opening the screen (URDF and 17 meshes through the API, cold cache); the app itself opened in 1.3 s | 0.7 s to the window; the model loads after |
| CPU, robot still | 71% of one core | 3.2% |
| CPU, robot driving at +z | 73% | 4.2% |
| Memory (proportional set size) | 1.33 GB | 131 MB |
| What reaches the viewer | 204 socket frames a second, 1.43 Mbit/s | `/tf` 30 KB/s and `/joint_states` 138 KB/s from DDS |

Two readings hide in that table. `/joint_states` on the Kinova mock hardware runs at 200 Hz, and the socket
forwarded every message: 200 JSON frames a second to a display that draws at most 60. And the browser's cost
is mostly Bloom's, not the view's: the same process runs the whole runtime, the socket, React, the camera
widget's image decoding and the position library, and a headed Chromium carries its GPU and utility processes
in the measured tree. rviz's tree is one process.

After the fixes the night produced, the runtime socket forwards at most 30 samples a second per topic
(`BLOOM_RUNTIME_TOPIC_MAX_RATE_HZ`), the description route answers 304 to an unchanged robot, and the view skips
a redraw when no joint moved. Same screen, same stack, same method:

| | Bloom's 3D view (whole browser) | rviz2 |
| --- | --- | --- |
| Time to a drawn robot | 1.0 s from opening the screen | 0.5 s to the window |
| CPU, robot still | 28% of one core | 3.6% |
| Memory (proportional set size) | 609 MB | 128 MB |
| What reaches the viewer | 64 socket frames a second, 0.38 Mbit/s: `/joint_states` and `/ee_pose` at 30 each, markers and camera frames | unchanged |

The driving phase of both runs commanded `+z` through `/joystick_cartesian_command` from the command line, but the
mock hardware did not move for it (`/ee_pose` unchanged), so the "moving" rows are the same as "still" and are
left out. The Widget Lab checks drive the arm through the runtime itself and prove the view follows.


## What the numbers mean

rviz is cheaper on the machine it runs on, by an order of magnitude, and will stay cheaper: it is one native
process drawing from DDS with no serialization in between. If the question were "which draws a robot for less
CPU on the laptop", rviz wins. That is not the question Bloom answers.

- **Where it runs.** Bloom's viewer is a browser tab that needs the API and nothing else: no Qt, no OpenGL
  driver setup, no mesh packages, no DDS on the client. The measured 28% is a headed Chromium on the laptop
  drawing the whole runtime; a second viewer on another laptop costs the robot's machine one more socket, not
  one more DDS participant. rviz needs a workstation on the robot's domain per viewer.
- **What it knows.** The view draws the commanded twist, the joint target and the pose because the runtime
  already holds them; rviz would need a node to publish each as a marker. The device-class rule keeps it off
  tablets and phones. STOP sits above it. Its markers are the same messages, so a node that draws for rviz
  draws for Bloom unchanged.
- **What the API controls.** The socket carries only allowlisted message types at a bounded rate, the mesh
  route serves only what the ament index vouches for, the description comes from one named node. rviz reads
  the whole graph.
- **What the benchmark found.** The first run's 200 frames a second was the runtime forwarding a 200 Hz topic
  unthrottled to every viewer, a cost every reading widget on every tablet paid, not only the 3D view. The
  throttle halved the browser's CPU and memory and cut the socket to a quarter. The view's own share is small:
  it renders on demand and skips a still robot.

Of the remaining 28%, part was the runtime's React re-render on each of the 64 frames. The runtime now applies
everything that arrived within a frame in one state update, which took the same measurement to 22.6% of a core
with memory unchanged at 610 MB; the rest is the browser's own baseline and the widgets' work. Both were runtime
changes, not view changes, and every reading widget on every tablet gets them.


## What rviz still does that the view does not

- TF frames outside the URDF. The view resolves a marker's frame against the robot's links and joints; a frame
  published by another node, such as a camera or a tag, draws at the base and is counted as unplaced.
- Interactive markers, point clouds, images in the scene, paths and occupancy grids.
- Line width: WebGL draws every line one pixel wide.
- Its property tree, which lets a person toggle any display from the window. Bloom's view is configured in the
  Builder, on purpose.

Each of these is a marker topic away or a small change to the widget when a bench needs it.

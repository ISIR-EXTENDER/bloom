# 0140 — The robot model served by the API

Date: 2026-09-24

## Context

The 3D robot view was a placeholder: nothing fetched a model, which its palette note said. Robin's list asked
for it, and the shared-control work wants what rviz gives (`shared_control_teleop/rviz/goal_markers.rviz`:
the robot model, TF and a `MarkerArray`) inside Bloom, to draw targets and trajectories without leaving the
tablet. INRIA's `extender-interface` ships a copy of the Explorer's URDF and meshes inside the web app, which
drifts from the robot the manager runs.

## Decision

The web app never carries a robot. The API serves the one that runs:

- `GET /api/v1/ros/robot-model` returns the `robot_description` parameter of the node that holds it
  (`BLOOM_ROS_ROBOT_DESCRIPTION_NODE`, `/robot_state_publisher` by default), read through the existing
  parameter gateway. Without ROS it reads `unavailable`.
- `GET /api/v1/ros/robot-model/assets/<package>/<path>` serves a mesh the URDF names, resolved through the
  ament index of the environment the API runs in. Only mesh and texture suffixes are served, containment is
  judged on the path as named (a `--symlink-install` workspace links every mesh into its source tree), and
  both routes need the observer key.
- The widget resolves `package://` URIs and the absolute `.../share/<package>/<path>` that xacro's
  `$(find)` writes to the same route, renders with three.js and `urdf-loader` in a lazy chunk, drives the
  joints from `/joint_states`, and draws a `MarkerArray` topic the way rviz does, attaching a marker to the
  robot link its `frame_id` names and to the base frame otherwise. No TF: the manager's frames are the
  URDF's links.
- Collada exports carry their own lights and cameras; they are stripped on load and every mesh takes one
  material, as `extender-interface` also had to.

## Consequences

- One more read-only surface on the API perimeter, listed with the others.
- A model URL setting stays inert: the view draws the API's robot, not a file someone uploaded.
- Widget Lab's `lab-robot-3d-draws-the-running-model` requires links, drawn meshes and the probe's two
  markers, so a description the API cannot serve, or a mesh route that answers 404, fails the run.
- 2026-09-24, later: the runtime tells the view each twist it sends, and the view draws the commanded linear
  motion as an arrow from the tool; the view is desktop-only by definition. Still absent: TF frames outside the
  URDF and interactive markers, each a marker topic away.
- 2026-09-24, evening: the view is meant to stand in for rviz while a simulation runs. It draws every
  marker kind rviz does (arrow, cube, sphere, cylinder, line strip and list, cube and sphere lists,
  points, text, mesh resource through the same API route, triangle list), with per-point colours,
  lifetimes and the delete actions; a frame that names a link or joint of the robot attaches there and
  any other is drawn at the base and counted as unplaced. It keeps asking for the description every
  three seconds until the robot is up, follows a new description within ten, and draws the commanded
  angular part as an arc. Still absent: TF frames outside the URDF, interactive markers, and line width
  (WebGL draws every line one pixel wide).

# 0139 — Live tuning through node parameters

Date: 2026-09-24

## Context

Three things Bloom wanted to offer had no path: the Snake shaping gain Robin's sessions tune between
runs, the manager's rate limiter, and the Petanque throw shape (`alpha`, `total_duration`,
`angle_between_start_and_finish`) that the app lost when it left the previous backend. None of them is
a topic. They are ROS parameters, and the control stack already treats them as live:
`cartesian_manager` rereads its parameters every tick, and `petanque_throw` declares its own through
the standard parameter services.

Until now Bloom could only publish messages and call trigger services. A gain slider in the Builder had
nowhere to send its value.

## Decision

Bloom gains a parameter seam, gated like everything else that reaches the robot:

- **Backend.** `POST /api/v1/ros/parameters/set` and `GET /api/v1/ros/parameters` talk to the node's
  own `set_parameters` / `get_parameters` services through an rclpy gateway. The backend allowlist
  `allowed_ros_parameters` names each `<node>:<parameter>` pair; the app's `runtime_policy.allowed_parameters`
  must name it too. Setting is owner-only, rate-limited and audited (`http_ros_parameter`). It is
  **allowed while STOP is latched**: a gain is configuration, not motion.
- **What is deliberately absent.** Joint targets, inputs and frames. cartesian_manager PR #11 makes them
  startup-only, so offering them would work today and silently stop working at the merge.
- **Widgets.** A slider with `runtime_binding.adapter = "parameter"` and `value_mapping.{node, parameter}`
  sets the parameter on every value change and opens on the value the node holds, read once per screen.
  The Builder's destination panel says "Sets parameter" and warns when the pair is outside the app policy.
- **Shipped.** Snake gain on both Managers' Drive · Bench; the three throw parameters on Petanque's
  Teleop settings. `e2e:sim` proves the path against the live manager: a slider press changes
  `ros2 param get /cartesian_manager shapers.snake.gain`.

## Consequences

- The coherence check validates parameter pairs on both sides and no longer mistakes a parameter
  binding for a publish topic.
- Saved poses remain export-only: replaying one would mean writing `behaviours.joint_targets`, which is
  exactly the parameter set PR #11 freezes at startup.
- `BLOOM_ALLOWED_ROS_PARAMETERS` overrides the backend list for a bench, the same way the topic lists do.

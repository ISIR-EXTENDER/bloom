# 0109 - ROS Topic Status Diagnostics

## Context

Robot tests need a fast way to distinguish three different states:

- a topic name is visible in the ROS graph;
- Bloom can publish or subscribe to that topic;
- another ROS node is actually connected on the opposite side.

The topic catalog already lists names and message types, but that is not enough
when debugging real teleoperation. A topic can exist while the controller path is
still disconnected or ignoring commands.

## Decision

Add a dedicated ROS topic status diagnostic endpoint:

```text
GET /api/v1/ros/topics/status
```

The endpoint returns topic name, message type, publisher count, and subscription
count. It stays separate from the lightweight topic catalog so normal UI views do
not become noisy, while Bloom Debug and robot preflight checks can request richer
diagnostics.

## Consequences

- Robot test preparation can verify `/teleop_cmd`, `/joint_states`, and controller
  feedback topics before asking an operator to move the robot.
- Bloom keeps topic diagnostics behind the backend ROS adapter instead of leaking
  ROS-specific graph checks into generic widgets.
- A visible topic is no longer treated as proof that the full robot control path
  is validated.

# 0043 - ROS Enabled API Launch

## Status

Accepted.

## Context

Bloom should stay usable as a generic web monorepo, but robot deployments need a clear way to attach real ROS behavior.
The first ROS publish API intentionally defaults to `simulated` when no publisher gateway is configured. That is safe for
local web development, but it needs an explicit runtime path for sourced ROS environments.

## Decision

Add `bloom api run-ros` as the first ROS-enabled backend launch command.

The command:

- imports `rclpy` only inside the command function;
- creates a ROS node named `bloom_api` by default;
- attaches `RclpyRosPublisherGateway` to the FastAPI app;
- runs Uvicorn with the concrete app object.

The regular `bloom api run` and `make run` commands remain ROS-free. `make ros-run` is a convenience alias for robot
environments.

## Consequences

- CI and local frontend development still work without ROS Python packages.
- Robot validation has a concrete launch path for publishing real typed messages from runtime widgets.
- Future subscriber/SSE/websocket adapters can build on this command, likely by adding an executor or a background ROS
  spin service when subscriptions become active.

# 0041 - ROS Topic Publish API

## Status

Accepted.

## Context

The legacy `tablet_interface` backend successfully bridges UI actions to ROS topics through small publisher caches:

- generic publishers for common messages such as `std_msgs/msg/Bool`, `std_msgs/msg/String`, and scalar values;
- typed publishers that resolve ROS message classes dynamically and fill fields from YAML-like payloads;
- websocket handlers that validate UI commands before publishing them.

Bloom needs the same capability, especially for configurable widgets that publish a topic, message type, and payload, but
the new monorepo must stay usable without ROS installed. Frontend, backend API, configuration storage, and widget tests
should remain generic web tests.

## Decision

Introduce a backend ROS publish boundary:

- `RosPublishRequest` and `RosPublishReceipt` model the action independently from FastAPI and `rclpy`;
- `RosPublisherGateway` is the injectable protocol used by the API layer;
- `NoopRosPublisherGateway` is the safe default and returns `simulated` instead of pretending a ROS message was sent;
- `RclpyRosPublisherGateway` keeps ROS imports lazy and can publish typed messages through an existing `rclpy` node.

Expose `POST /api/v1/ros/topics/publish` as the first runtime ROS endpoint. The frontend API client mirrors this contract
so future widgets and runtime screens do not build URLs by hand.

## Consequences

- Bloom can start connecting runtime widgets to ROS without coupling the whole application to ROS imports.
- CI remains independent from ROS and validates the web/API contract with injected test gateways.
- The next migration slices can connect command buttons, generic topic publishers, sliders, toggles, and topic debug
  screens to this boundary.
- A later runtime app can decide whether it uses a real `rclpy` gateway, a simulator gateway, or a deployment-specific
  adapter.

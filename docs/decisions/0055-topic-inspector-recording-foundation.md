# 0055 - Topic inspector and recording foundation

## Context

Bloom will need debug and data-capture tools that are easier to use than terminal commands. A common workflow is starting
and stopping rosbag recordings from an operator app, with a selected list of topics and a chosen output folder.

This depends on topic introspection, runtime status, filesystem safety, and ROS command adapters.

## Decision

Bloom should treat recording as a generic session/action capability, not as a hard-coded ROS-only widget.

The ROS implementation can eventually control rosbag, but the frontend should model:

- available topics with names, message types, rates, and recording eligibility;
- selected topics;
- approved output folders or folder presets;
- start, stop, and status actions;
- recording metadata for logs and future replay/import workflows.

## Safety Rules

- The UI should not accept arbitrary filesystem paths without backend validation.
- Recording destinations should be configured as approved folders or deployment presets.
- Topic selection should use introspected topics plus optional allowlists.
- The backend should own process management for rosbag start/stop.
- Generic tests should use injected adapters and should not require ROS.

## Consequences

- Topic inspector, topic echo, telemetry plots, and recording controls share the same runtime topic discovery foundation.
- Bloom can support rosbag first, then other recording/session backends later.
- Security work around topic allowlists and filesystem paths becomes part of the runtime migration plan.

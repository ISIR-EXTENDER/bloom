# 0089 - Runtime Debug And Recording Foundation

Date: 2026-06-04

## Context

Phase 3 needs Bloom to become safer and more useful during real robot sessions before migrating more legacy robot
widgets. Operators need to inspect topics, capture short debugging sessions, and understand rejected commands without
leaving the web app.

## Decision

Bloom now treats runtime debug as a first-class foundation:

- Runtime command rate limits are applied to HTTP ROS publishes and WebSocket teleop commands after command allowlists
  and payload validation.
- Runtime audit records are kept for accepted and rejected robot-facing commands.
- Bloom Debug can load the topic catalog, refresh audit records, and start/stop a recording request through a backend
  gateway.
- Recording requests are constrained to selected topics and approved relative output folders.
- Topic echo widgets support pause, clear, and copy actions so users can inspect live data without drowning in logs.

The recording gateway is intentionally adapter-based. The default implementation is safe and simulated so CI and
non-ROS contributors can exercise the API. A later ROS adapter can map the same contract to `ros2 bag record`.

## Consequences

- The frontend keeps generic runtime actions and does not know how ROS bags are implemented.
- The backend owns safety boundaries: allowed folders, rate limits, audit logs, and future ROS adapter wiring.
- Bloom Debug is now a practical runtime surface for early robot validation instead of just a fixture screen.
- Future work can add real rosbag process management, topic metadata enrichment, and persistent audit storage without
  changing widget contracts.

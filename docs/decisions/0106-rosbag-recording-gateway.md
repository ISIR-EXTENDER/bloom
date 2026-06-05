# 0106 - Rosbag Recording Gateway

Date: 2026-06-05

## Context

Bloom Debug already exposes recording controls, but the default backend gateway is simulated so contributors can run the
app without ROS. Phase 5 needs a concrete deployment path for real `ros2 bag record` sessions while preserving safe
defaults and testability.

## Decision

Bloom now includes an opt-in `RosbagRuntimeRecordingGateway`:

- local and CI deployments still use the no-op simulated gateway by default;
- `BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag` enables process-backed `ros2 bag record`;
- recording topics must pass the runtime recording-topic allowlist;
- output folders must still be approved relative folders;
- missing `ros2` executables return a controlled service-unavailable response instead of crashing the API;
- process management stays in the backend, not the frontend.

## Consequences

- Bloom Debug can evolve into a real lab recording tool without coupling widgets to ROS subprocess details.
- Operators get the same frontend workflow in simulated and ROS-enabled deployments.
- Deployment documentation must list the recording variables clearly because enabling rosbag changes runtime side
  effects.
- Future work can add persistent recording status, storage cleanup, and replay/import workflows on top of the same
  gateway contract.

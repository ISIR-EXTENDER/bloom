# 0111 - Petanque Runtime Publish Allowlist

## Context

Bloom enforces two runtime publish guardrails before a ROS command reaches the robot:

- app-level `runtime_policy` entries stored in configuration bundles;
- backend-level allowlists loaded from `Settings`.

The migrated Petanque app already declared the topics it needs, but the backend defaults still only covered a smaller
Sandbox-focused subset. That could make a correctly configured Petanque button or toggle fail at the backend boundary
during robot tests.

## Decision

Extend the backend default publish allowlist to include the Petanque command topics already declared by the migrated app:

- `/petanque/measure/request_image`
- `/petanque/teleop/enabled`
- `/petanque/throw/alpha`
- `/petanque/throw/gesture`
- `/ui/save_pose`
- `/visual_servoing/enabled`

Also include `std_msgs/msg/Float64MultiArray` in the default message-type allowlist for migrated legacy controls.

Expose backend runtime policy allowlists through environment variables so lab sessions can adjust topic/message coverage
without patching code:

- `BLOOM_ALLOWED_ROS_PUBLISH_TOPICS`
- `BLOOM_ALLOWED_ROS_MESSAGE_TYPES`
- `BLOOM_ALLOWED_TELEOP_TARGETS`
- `BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND`

## Consequences

- Petanque runtime widgets can pass both the app policy and backend safety policy without requiring local environment
  overrides for the standard lab workflow.
- The backend still rejects unknown robot topics by default; this is not a wildcard policy.
- New robot-facing topics should be added deliberately to the app policy and backend settings together.
- Temporary lab-specific policies can be supplied at launch time, but deployment documentation should keep them explicit
  and narrow.

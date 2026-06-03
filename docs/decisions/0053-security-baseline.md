# 0053 - Security baseline

## Context

Bloom is moving from a local UI migration into a reusable robot web app platform. The next features will touch saved
applications, runtime sessions, ROS topic publishing, and eventually live robot control.

Security needs to be considered now so the foundation does not normalize unsafe patterns.

## Decision

Bloom will track a minimal security baseline in `docs/security-baseline.md`.

The initial implementation adds low-risk backend HTTP security headers and tests them. Future robot-facing work should
use typed intents, backend validation, allowlisted ROS topics/message types, and injected ROS adapters.

## Consequences

- Security becomes part of the migration roadmap, not a final polish task.
- Generic frontend code still does not talk directly to ROS.
- Configurable ROS widgets stay possible, but they should become auditable and allowlist-aware before real robot use.
- CI can grow progressively with dependency audits, secret scanning, and a ZAP baseline once routes stabilize.

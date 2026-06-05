# 0103 - Production API Security Perimeter

Date: 2026-06-05

## Status

Accepted.

## Context

Bloom is moving from migration foundations toward deployment readiness. The API can mutate app configurations and publish
runtime robot commands through adapters, so the development-default open API is no longer enough as the project approaches
real deployments.

The team still needs a local-first workflow: developers should be able to run the dashboard and backend without account
setup while iterating on UI, widgets, and ROS adapters. Production and staging deployments, however, should fail closed if
authentication is missing.

## Decision

Bloom now has a minimal API security perimeter:

- authentication can be enabled with `BLOOM_AUTH_ENABLED=true`;
- an admin API key can mutate configuration and assets;
- an operator API key can read configuration and use runtime/ROS endpoints;
- production settings require authentication and an admin key;
- CORS origins are configured explicitly;
- a global HTTP rate limit protects the API from accidental or noisy clients;
- Python and frontend dependency audits are available through repository scripts.

This is intentionally not a full user identity system. It is a pragmatic lab/deployment guardrail while Bloom continues
toward profiles, workspace projects, and real deployment packaging.

## Consequences

- Local and test mode remain frictionless because authentication is disabled by default.
- Production configuration must provide `BLOOM_AUTH_ENABLED=true` and `BLOOM_ADMIN_API_KEY`.
- Runtime WebSocket sessions also check the operator/admin key because HTTP route dependencies do not protect WebSocket
  upgrades automatically.
- Future work can replace or extend API keys with user sessions, SSO, or deployment-specific auth without changing the
  generic widget/runtime contracts.

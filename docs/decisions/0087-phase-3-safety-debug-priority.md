# 0087 - Phase 3 Starts With Runtime Safety And Debug

Date: 2026-06-04

Status: accepted

## Context

A full Bloom review showed that the web product foundation is now strong enough to continue the migration, but the
runtime is ahead of the safety layer. Bloom can publish ROS commands and stream topic samples, yet real configurable
robot use needs stronger guardrails before broad widget migration.

## Decision

Phase 3 should prioritize:

- topic, message type, payload, and rate allowlists for runtime robot commands;
- runtime audit logs for accepted and rejected command attempts;
- Bloom Debug topic catalog, topic selector, pause/clear/copy controls, and minimal plot polish;
- ROS/message widget migration only after the safety boundary is explicit.

## Consequences

- More widgets can still be migrated, but they should not bypass runtime safety contracts.
- Bloom Debug becomes a product feature, not only a development aid.
- The next UX goal is reducing operator uncertainty: connected state, command acceptance, topic visibility, and clear
  feedback after touch interactions.

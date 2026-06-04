# 0088 - Runtime Command Safety Foundation

Date: 2026-06-04

Status: accepted

## Context

Bloom can now publish ROS topic messages and send teleop commands through runtime WebSocket sessions. This proves the
architecture, but configurable robot commands must not stay open-ended before real robot deployment.

## Decision

Introduce a first runtime command safety layer:

- global allowlists for ROS publish topics, ROS message types, and teleop targets;
- minimum payload shape validation for common `std_msgs` payloads;
- in-memory runtime audit records for accepted and rejected HTTP ROS publishes and WebSocket teleop commands;
- a `GET /runtime/audit` endpoint that Bloom Debug can consume.

The current defaults cover known Bloom/Extender development topics. Future work should move policy configuration toward
project/app/deployment settings and add rate limits.

## Consequences

- Unknown robot command targets now fail before reaching ROS gateways.
- Rejected and accepted commands leave a visible audit trail.
- Bloom Debug can grow from live topic inspection into a real runtime safety console.

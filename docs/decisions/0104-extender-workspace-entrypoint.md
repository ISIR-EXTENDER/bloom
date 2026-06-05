# 0104 - Extender Workspace Entrypoint

Date: 2026-06-05

## Status

Accepted.

## Context

Phase 5 needs deployment entrypoints, but Bloom should not become low-level ROS code. The existing Extender workspace is
still the source of truth for robot packages, controllers, launch files, and hardware/simulation setup. Bloom should run
beside it and consume ROS through backend adapters.

## Decision

Add a lightweight `scripts/extender-workspace-dev.sh` launcher in Bloom. It sources the Extender workspace setup file,
starts the Bloom API in ROS-adapter mode, starts the dashboard dev server, and optionally applies the tablet touch
mapping script.

This is a transition entrypoint for local lab validation, not final deployment packaging.

## Consequences

- Bloom remains app/product-oriented instead of becoming another ROS package.
- The team gets one command to start the current Extender validation stack around Bloom.
- Legacy repos are not deleted or hidden.
- Future packaging can replace this script with systemd, launch integration, or another deployment strategy after the
  full Extender/Petanque pipeline is accepted.

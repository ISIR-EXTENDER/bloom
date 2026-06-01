# 0004: Start With A Generic FastAPI Backend Foundation

Date: 2026-06-01

## Decision

Bloom starts with a generic FastAPI backend foundation before migrating ROS-specific behavior.

The backend app is composed in `backend/apps/bloom_api/main.py` through `create_app()`. Routes are grouped under `/api/v1`, beginning with `/api/v1/health`.

Settings live in `backend/apps/bloom_api/settings.py` and are injected into `create_app()` for tests and future runtime configuration.

## Context

The existing tablet backend mixes web API concerns with ROS runtime concerns. Bloom should make those boundaries explicit before moving features over.

Starting with app composition, settings, routers, and tests gives future migration PRs a stable place to land.

## Consequences

- New HTTP routes should be added through route modules, not inline in `main.py`.
- Tests should instantiate the app through `create_app()`.
- Generic API code must not import ROS.
- ROS-specific code belongs in `backend/libs/ros_adapters` and should be wired into the app through explicit interfaces later.
- The current backend foundation intentionally does not include database, websocket, or ROS runtime behavior yet.

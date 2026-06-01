# 0006: Add Configuration Domain Models Before Storage

Date: 2026-06-01

## Decision

Add typed backend configuration domain models before implementing JSON import/export, API endpoints, or database storage.

The first models live in `backend/libs/config` and describe:

- configuration bundles
- metadata
- applications
- screens
- widgets

## Context

Bloom is migrating from JSON-driven UI configuration. Before replacing JSON sync with database-backed storage, we need a stable typed shape for the data.

Keeping this step storage-free makes the migration safer: we can validate configuration structures and preserve JSON compatibility before introducing persistence.

## Consequences

- The config domain library must not depend on FastAPI, ROS, or database code.
- JSON import/export services should use these models as their boundary.
- API endpoints should expose these models or explicit DTOs derived from them.
- Database schema design should happen after model behavior and JSON compatibility are tested.

# 0009: Add Configuration API Before Database Storage

Date: 2026-06-01

## Decision

Expose configuration bundle operations through `/api/v1/configurations` before adding database-backed persistence.

The first API version uses an in-memory repository injected into the FastAPI app state.

Initial endpoints:

- `GET /api/v1/configurations`
- `GET /api/v1/configurations/{config_id}`
- `PUT /api/v1/configurations/{config_id}`
- `DELETE /api/v1/configurations/{config_id}`

## Context

Bloom needs a stable HTTP contract before the frontend migration and before database storage. Keeping the first repository in memory lets us test route behavior and domain model serialization without committing to a storage design too early.

## Consequences

- API behavior can be tested independently from SQLite/file storage.
- Database work can replace the repository implementation without changing route contracts.
- The API currently does not persist data across process restarts.
- Future storage backends should implement the same repository behavior.

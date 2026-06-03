# 0052 - App And Screen Storage API

## Status

Accepted

## Context

The dashboard previously saved app and screen edits by replacing the full configuration bundle from the frontend. That
kept early migration simple, but it made app/screen lifecycle operations feel too document-oriented for the future
SQLite app library.

## Decision

Bloom now exposes app and screen lifecycle endpoints under the configuration API:

- list applications in a configuration;
- upsert/delete one application;
- list reusable screens in a configuration with source-app metadata;
- upsert/delete one screen inside an application.

The dashboard uses `upsertApplication` and `upsertScreen` for app configuration and screen builder saves. The backend
still stores canonical bundles through the repository abstraction today, but these endpoints create the product contract
needed for a future normalized SQLite app/screen store.

## Consequences

- Builder workflows no longer need to replace whole bundles for common app/screen edits.
- Frontend and backend contracts are tested separately through API-client, dashboard, and FastAPI tests.
- SQLite can evolve from bundled documents to normalized app/screen records without changing the dashboard workflow.

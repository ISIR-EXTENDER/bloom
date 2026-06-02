# 0036 - Configuration Storage CLI

## Status

Accepted.

## Context

Bloom is migrating configuration persistence from local JSON files toward SQLite. The migration must stay incremental: legacy JSON remains useful for fixtures, export, manual inspection, and safe fallback while SQLite becomes the durable application storage.

Developers also need a short command path to validate storage behavior without starting the frontend or writing ad-hoc scripts.

## Decision

Add a Typer `config` command group with focused storage operations:

- `config list` lists stored configuration IDs.
- `config import` imports a typed `ConfigurationBundle` JSON file into the selected storage backend.
- `config export` writes a stored configuration bundle back to JSON.

The CLI uses the same repository factory as the FastAPI app. It supports both `file` and `sqlite` storage so migration tests can compare both paths without duplicating storage logic.

## Consequences

- SQLite storage can be exercised before the UI migration depends on it.
- Legacy JSON files remain first-class migration fixtures, not hidden implementation details.
- The CLI is intentionally narrow for now; broader app/screen management commands should be added only when the corresponding domain models and API endpoints are stable.

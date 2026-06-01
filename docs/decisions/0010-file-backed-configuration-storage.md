# 0010: Use File-Backed Configuration Storage Before SQLite

Date: 2026-06-01

## Decision

Add a file-backed configuration repository before introducing SQLite.

The repository stores each `ConfigurationBundle` as one JSON file under the configured configuration directory.

## Context

Bloom is migrating from JSON files. The frontend migration needs backend persistence, but SQLite would add schema and migration decisions before the API and configuration workflows are fully exercised.

File-backed storage gives us useful persistence while preserving the current JSON mental model.

## Consequences

- The backend can persist configuration changes across process restarts.
- Tests can use temporary directories without external services.
- The database layer can later replace the repository implementation while keeping the route contract stable.
- File-backed storage is an intermediate step, not the final multi-user persistence layer.

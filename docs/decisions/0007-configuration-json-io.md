# 0007: Preserve JSON Import And Export Before Database Storage

Date: 2026-06-01

## Decision

Add JSON import/export helpers for configuration bundles before introducing database storage.

The helpers live in `backend/libs/config/json_io.py` and convert between JSON strings/files and the typed configuration domain models.

## Context

Bloom is migrating from JSON-driven configuration. Before adding SQLite or API persistence, we need a safe bridge that can validate existing JSON and export typed configuration data back to JSON.

## Consequences

- JSON compatibility remains testable during the migration.
- Existing configuration files can be preserved and round-tripped.
- Database work should use these helpers for import/export rather than bypassing the domain models.
- This step still does not add API endpoints or persistence policy.

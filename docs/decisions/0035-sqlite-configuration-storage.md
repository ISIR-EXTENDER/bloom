# 0035. SQLite Configuration Storage

## Status

Accepted

## Context

Bloom currently stores configurations through local JSON files.
That is useful during migration, but it repeats the old sync pain from `extender_ui` and does not scale well once users
create, duplicate, rename, and migrate apps/screens from the web interface.

The configuration contracts are now stable enough to persist as canonical bundles while keeping JSON import/export as a
migration and backup path.

## Decision

Add SQLite as the next storage foundation for configuration bundles.
The first storage slice keeps the schema intentionally small:

- one `schema_migrations` table to track applied migrations;
- one `configuration_bundles` table storing each validated `ConfigurationBundle` as canonical JSON;
- repository methods matching the existing file-backed repository: `list_ids`, `get`, `upsert`, and `delete`.

Use Python's standard `sqlite3` module for now.
Do not remove `FileConfigurationRepository`; it remains a compatibility and fallback path while parity is verified.

## Consequences

- Bloom gains database-backed persistence without forcing a larger ORM decision too early.
- JSON import/export remains available for migration, backup, and tests.
- Future migrations can evolve the schema once builder workflows and runtime adapters stabilize.

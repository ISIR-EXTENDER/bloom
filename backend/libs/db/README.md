# Database Library

Database connection helpers and migrations live here.

Current scope:

- SQLite connection helper using Python's standard `sqlite3`.
- Idempotent schema migration tracking.
- Configuration bundle storage table used by `SQLiteConfigurationRepository`.
- Normalized mirror tables for applications, screens, widgets, and theme assets.

The migration must preserve existing JSON configuration files until parity is verified. `FileConfigurationRepository`
therefore remains the default backend storage unless `configuration_storage="sqlite"` is selected.

The full configuration bundle remains the lossless source during Phase 2. The normalized rows are synchronized on each
upsert so Bloom can introduce app/screen library queries without risking legacy JSON data loss.

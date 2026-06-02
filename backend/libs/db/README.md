# Database Library

Database connection helpers and migrations live here.

Current scope:

- SQLite connection helper using Python's standard `sqlite3`.
- Idempotent schema migration tracking.
- Configuration bundle storage table used by `SQLiteConfigurationRepository`.

The migration must preserve existing JSON configuration files until parity is verified. `FileConfigurationRepository`
therefore remains the default backend storage unless `configuration_storage="sqlite"` is selected.

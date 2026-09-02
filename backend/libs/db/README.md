# Database Library

Database connection helpers and migrations live here.

Current scope:

- SQLite connection helper using Python's standard `sqlite3`.
- Idempotent schema migration tracking.
- Configuration bundle storage table used by `SQLiteConfigurationRepository`.
- Normalized mirror tables for applications, screens, widgets, and theme assets.

SQLite is the default store (`0123`). `FileConfigurationRepository` remains available via
`configuration_storage="file"`, and a machine that still has a file-backed `backend/data/configurations/` is adopted
into an empty database on first start.

The full configuration bundle is kept alongside the normalized rows, which are synchronized on each upsert. Reads
rebuild from the normalized rows, so **a field added to `ApplicationConfig` must also be added to the mirror**: it will
otherwise be dropped on the way back out, with no error anywhere. That happened to `lifecycle`, which meant archived
applications came back active. `tests/test_sqlite_configuration_repository.py` round-trips every shipped bundle to
catch the next one.

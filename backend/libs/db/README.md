# Database Library

Database connection helpers and migrations live here.

Current scope:

- SQLite connection helper using Python's standard `sqlite3`.
- Ordered, transactional schema migrations with explicit version tracking.
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

Schema v5 owns the lifecycle column and restores its value from the canonical bundle. Migrations apply one version at
a time and stamp only after commit; v1-v4 snapshot tests exercise real upgrades. Bloom refuses future or discontinuous
migration ledgers rather than opening them with an older schema. Back up the SQLite file before moving a machine to a
new Bloom release.

# 0123 - SQLite as the default configuration store

Date: 2026-09-02

## Context

`0035` chose SQLite as the destination for configuration storage and kept
`FileConfigurationRepository` as "a compatibility and fallback path while parity
is verified". Parity was never verified, nothing migrated into the database, and
`configuration_storage` still defaulted to `file`. The result was a database that
existed, had a migration system and normalized tables, and was used by nobody:
`backend/data/bloom.db` did not exist on any machine.

Leaving it there had a cost beyond tidiness. Two bugs were sitting behind the
unused default, and both only surface when SQLite is actually the store.

## Decision

SQLite is the default, at `backend/data/bloom.db`. File storage stays available
via `BLOOM_CONFIGURATION_STORAGE=file`.

A machine with an existing file-backed `backend/data/configurations/` is adopted
into an empty database the first time the API starts, so screens people have
rearranged come with them. Adoption happens only into an empty store; after that
the database is the source of truth and the JSON files are history.

## What this uncovered

**The normalized mirror lost a field.** SQLite stores the canonical bundle JSON
*and* a mirror in normalized rows, and reads rebuild from the rows. `lifecycle`
was added to `ApplicationConfig` in `0121` and the mirror was never taught about
it, so every bundle that went through SQLite came back with its applications
`active`. Petanque would have un-archived itself the first time anyone saved it,
undoing `0121` in silence.

The guard is not a test that names `lifecycle`. A field can go missing this way
with no error at all, so the test round-trips every shipped bundle and asserts
nothing is lost, which catches the next one.

**The test suite wrote to the developer's own store.** `configuration_dir` and
`configuration_database_path` are relative paths, resolved from the working
directory, which during a test run is `backend/`. Any test that built settings
from bare defaults wrote into real data: a run left a `play-petanque`
configuration behind and replaced `sandbox` with a test fixture.

Tests now run from a temporary working directory. Fixing each test that forgot to
pass a temp path would have worked until the next one forgot; moving the working
directory makes the real store unreachable however a test builds its settings.

## Consequences

- Sharing is unaffected, because it never depended on the store. JSON stays the
  interchange format, and `config seed` / `config publish` work against whichever
  backend is configured.
- The CLI follows the configured storage instead of hardcoding `file`. It used to
  read a different store than the running server and report stale content without
  saying so.
- The coherence check's local-file comparison is gone: it compared against a
  location that is no longer the store. `config status` reads the real one.
- `backend/data/` stays gitignored, so the database is never committed.
- Runners that assert on JSON files on disk pin `--storage file` explicitly.

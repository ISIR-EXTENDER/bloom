# Versioned configuration upgrades validation

Date: 2026-09-16

## Scope

This validation covers SQLite schema v5, configuration-document version rejection, and preservation of app runtime
policies through dashboard compatibility loading and Builder saves.

## Automated evidence

- `cd backend && make test`: 342 tests passed.
- `npm test -- --run`: 620 tests passed across Dashboard, API client, UI, renderers, and widgets.
- `npm run build`: all frontend workspaces built; Vite retained its existing warning for the 505.83 kB main chunk.
- `npm run check`: passed with the five existing warnings in `App.test.tsx`, `runtime-app.css`, and `runtime-tour.css`.
- `npm run validation:frontend-backend`: passed for committed apps and fixtures.
- `npm run validation:extender`: passed and found the Extender workspace setup.

The backend suite creates stored v1, v2, v3, and v4 database snapshots and proves that each reaches v5 without changing
the configuration bundle reconstructed from normalized rows. A separate fixture reproduces a v4 database where an
older build already added `lifecycle` without stamping a new version; v5 restores `archived` from canonical JSON. A
forced v3 failure proves its DDL and ledger stamp roll back together. Future SQLite and configuration-document versions
are rejected.

Dashboard tests load the committed Kinova Manager bundle, preserve `/fault_controller/reset_fault`, edit the service
allowlist through app configuration, and submit it unchanged with the rest of the runtime policy.

## Not validated here

- No real operator database was modified; the migration ran only against isolated snapshots and temporary test stores.
- No downgrade is supported. Operators must back up the stopped SQLite file before installing a release with a newer
  schema.
- `npm run qa:review` still reports its existing duplicated runtime-preference-key construction in three frontend
  modules. That is unrelated to configuration persistence and remains a maintainability follow-up.

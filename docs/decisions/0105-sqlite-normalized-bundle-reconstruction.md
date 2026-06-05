# 0105 - SQLite Normalized Bundle Reconstruction

Date: 2026-06-05

## Status

Accepted.

## Context

Bloom has kept JSON bundles as the lossless migration bridge while writing normalized SQLite mirror rows for apps,
screens, widgets, themes, profiles, runtime policies, and action presets. That was safe during the early migration, but
reading only from the bundle JSON meant the normalized schema was not yet a true source for application reconstruction.

## Decision

SQLite configuration reads now reconstruct `ConfigurationBundle` values from normalized tables when normalized rows are
available. The stored JSON bundle remains as a migration/export fallback for old or partially imported records.

The schema now stores:

- bundle metadata;
- app theme/profile/runtime-policy/action-preset JSON fragments;
- screen canvas records;
- widget layout/settings records.

## Consequences

- SQLite rows are now useful for future app/screen/widget APIs and queryable persistence.
- JSON import/export remains intact and lossless enough for migration safety.
- Future schema changes should continue to keep reconstruction tests around real legacy fixtures.
- The future project/workspace layer can be added above apps without rewriting the whole bundle reader.

# 0008: Keep Legacy JSON Adapters Separate

Date: 2026-06-01

## Decision

Add explicit legacy JSON adapters instead of weakening the Bloom configuration domain models to match old frontend files directly.

The adapters live in `backend/libs/config/legacy_json.py`.

## Context

Current `extender_ui/data` files use shapes that differ from Bloom's new domain model:

- screen files contain `name`, `widgets`, `canvas`, and `updatedAt`
- application files contain `screenIds` and `homeScreenId`
- widgets may contain arbitrary UI-specific fields

Bloom still needs to load those files during migration, but the clean domain model should remain storage- and frontend-agnostic.

## Consequences

- Legacy fields are preserved in widget `settings` where possible.
- Legacy screen/application files can be tested as fixtures.
- Future import tooling can use these adapters as the compatibility layer.
- New Bloom JSON should use `ConfigurationBundle`; old files should go through legacy adapters.

## Removal Criteria

These adapters are temporary migration code. They can be removed after:

- all required legacy JSON files have been imported into Bloom's canonical configuration format
- JSON export from Bloom can reproduce the data needed for rollback or backup
- frontend migration no longer reads `extender_ui/data` files directly
- at least one release/validation cycle has run without legacy adapter usage

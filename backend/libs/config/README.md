# Config Library

Typed configuration domain models live here.

This library describes Bloom concepts such as applications, screens, widgets, and exported configuration bundles. It should stay independent from:

- HTTP route handling
- database persistence
- ROS topics/services/actions
- frontend rendering details

## JSON IO

`json_io.py` contains file/string helpers for loading and saving configuration bundles. These helpers preserve the JSON migration bridge before database storage is introduced.

## Repositories

`repository.py` contains configuration repository implementations:

- `InMemoryConfigurationRepository` for tests and temporary runtime state
- `FileConfigurationRepository` for local JSON-backed persistence before database storage

`sqlite_repository.py` stores configuration bundles in SQLite while Bloom validates the database-backed migration path.
It also synchronizes normalized mirror rows for apps, screens, widgets, and theme assets so Phase 2 can support a real
app/screen library without losing the full JSON migration bridge.

## Editor Operations

`editor.py` contains pure app/screen lifecycle operations used by the API layer:

- upsert/delete applications;
- upsert/delete screens;
- list reusable screens with source application metadata.

These operations keep route handlers thin and make the future normalized SQLite app/screen store easier to introduce.

## Legacy JSON

`legacy_json.py` contains adapters for the current `extender_ui/data` JSON shapes. These adapters should preserve legacy payload details in widget settings while mapping screens and applications into Bloom domain models.

These adapters are migration-only. New Bloom configuration files should use `ConfigurationBundle` and the regular JSON IO helpers.

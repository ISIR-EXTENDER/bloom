# 0037 - Legacy Configuration CLI Imports

## Status

Accepted.

## Context

Bloom still depends on legacy `extender_ui` JSON files during migration. Those files are not all canonical
`ConfigurationBundle` exports: some describe one screen, while others describe an application shell.

We need a safe way to import those files into the selected storage backend without losing the original files or hiding
conversion behavior behind implicit auto-detection.

## Decision

Add explicit Typer commands for legacy imports:

- `config import-legacy-screen` wraps one legacy screen in a canonical `ConfigurationBundle`.
- `config import-legacy-application` converts one legacy application JSON file into a canonical `ConfigurationBundle`.

Both commands support file-backed and SQLite-backed repositories through the shared storage factory.

## Consequences

- Legacy migration can be tested from the CLI using real fixtures before the frontend builder depends on SQLite.
- Conversion remains visible and intentional.
- Original JSON files remain untouched; import/export is a migration bridge, not a destructive sync workflow.

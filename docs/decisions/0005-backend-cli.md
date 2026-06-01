# 0005: Use Typer For Backend Commands

Date: 2026-06-01

## Decision

Use Typer for Bloom backend command line tools.

The CLI starts in `backend/apps/bloom_cli` and is executed with:

```bash
uv run python -m apps.bloom_cli.main
```

Initial commands:

- `version`
- `api run`

## Context

Bloom will need developer and migration commands for API startup, configuration validation, JSON import/export, and future database work.

Typer gives us typed commands, help output, and test support without building a custom command framework.

## Consequences

- Backend command execution should stay `uv`-first.
- Makefile commands may delegate to the Typer CLI.
- CLI tests should use Typer's `CliRunner`.
- Future operational tasks should become CLI commands instead of undocumented shell snippets.

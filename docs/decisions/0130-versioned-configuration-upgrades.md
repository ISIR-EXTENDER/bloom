# 0130 - Versioned configuration upgrades

Date: 2026-09-16

## Context

Bloom's SQLite helper used to recreate every known table and column on every startup, then stamp every schema version
as applied. That made fresh databases work, but the migration ledger did not identify which changes had actually run.
It also hid an unversioned change: application `lifecycle` was added after schema v4. An existing archived application
could therefore acquire the column's `active` default in its normalized row even though the lossless bundle still said
`archived`.

The dashboard had a related document-loss path. Its compatibility normalizer rebuilt runtime policies without
`allowed_service_calls`, so saving Kinova Manager after opening it in the Builder removed the fault-reset allowlist.
Neither the backend nor dashboard rejected a configuration document marked as newer than the code reading it.

## Decision

- SQLite migrations run in order and stamp one version only after that version succeeds transactionally.
- Schema v3 backfills metadata, runtime policy, and action presets from each canonical bundle. Schema v5 owns the
  lifecycle column and backfills it from the same bundle, including databases where the column was already added by an
  older Bloom build.
- A future, invalid, or discontinuous migration ledger fails closed instead of being rewritten by an older build.
- Historical v1-v4 database snapshots are release tests and must preserve the full configuration on upgrade.
- Configuration JSON remains schema v1 while additions are backward-compatible defaults. Backend and dashboard both
  reject a schema version newer than they support; a future incompatible format must add an explicit document
  migration before raising the current version.
- The frontend runtime-policy contract includes `allowed_service_calls` as a required field. Compatibility loading
  supplies an empty list for older documents, preserves current values, and exposes the list in app configuration.

## Consequences

Existing databases move to schema v5 on first open without losing archived state or service-call guardrails. A failed
migration remains unstamped and can be diagnosed from the original database. Rolling an old Bloom binary onto data
written by a newer schema now produces a clear startup/load error instead of a plausible but lossy configuration.

The lossless bundle remains the migration source for fields introduced after normalized tables. New normalized fields
must receive a numbered SQLite migration, a canonical-bundle backfill where relevant, and an old-schema regression
test. New configuration-document versions require matching backend and frontend compatibility work.

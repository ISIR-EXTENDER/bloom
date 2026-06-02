# 0034. Legacy Widget End-To-End Tests

## Status

Accepted

## Context

Bloom widget foundations are only useful if real legacy configurations can survive the path from import to storage to
render preparation.

## Decision

Add integration tests that round-trip real `extender_ui` JSON fixtures through:

- frontend legacy conversion;
- API-client upsert/get semantics;
- widget registry descriptor rendering;
- backend FastAPI PUT/GET with file-backed persistence.

These tests do not require ROS or a running server.
They exercise the same contracts that future SQLite and runtime adapters will consume.

## Consequences

- Regressions in legacy migration are caught before UI polish or database migration.
- Backend and frontend contract assumptions stay aligned on real data.
- The widgets foundation PR can be reviewed against concrete migration behavior, not only unit tests.

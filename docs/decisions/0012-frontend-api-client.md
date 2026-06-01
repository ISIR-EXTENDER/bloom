# 0012. Frontend API Client

## Status

Accepted

## Context

Bloom frontend applications need to consume the FastAPI configuration endpoints without scattering raw `fetch` calls through React components. The backend API already exposes configuration listing, retrieval, upsert, and deletion under `/api/v1/configurations`.

## Decision

Introduce `frontend/libs/api-client` as the typed boundary between frontend apps and the Bloom API.

The first client covers configuration endpoints and keeps transport details in one place:

- Base URL normalization for local and deployed API roots.
- URL encoding for configuration ids.
- Typed configuration bundle responses shared with dashboard code.
- `BloomApiError` for non-2xx responses so UI code can handle failures predictably.
- Shared JSON contract fixtures used by backend and frontend tests.

## Consequences

Dashboard components should depend on this library instead of creating ad hoc `fetch` calls. The client remains framework-independent, so it can be used by React hooks, future state services, or tests without importing React.

# 0013. Dashboard Configuration Loading

## Status

Accepted

## Context

The dashboard foundation and typed API client exist, but the React app did not yet consume backend configuration data. Before migrating widgets, Bloom needs a small vertical slice proving that dashboard code can load configurations through the frontend API boundary.

## Decision

Add a minimal configuration loading path to the dashboard:

- `configuration-client` creates the default API client from `VITE_BLOOM_API_URL`.
- `configuration-loader` loads all listed configuration bundles through the API client.
- `useConfigurations` owns React loading, ready, and error states.
- `App` accepts an injected configuration client for tests while production uses the default client.

## Consequences

The dashboard now has the first UI-to-API seam without coupling React components to raw `fetch`. Future work can render configuration-driven screens on top of this path, then move repeated UI patterns into `frontend/libs/ui`.

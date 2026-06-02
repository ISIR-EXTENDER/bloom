# 0032. Topic Debug Renderer Data

## Status

Accepted

## Context

`topic-plot` and `topic-echo` need to render useful runtime data, but Bloom should not put ROS subscriptions or message
decoding inside React components.

## Decision

Allow widget renderers to receive data snapshots keyed by widget id.
`topic-echo` consumes bounded message snapshots and `topic-plot` consumes timeseries sample snapshots.

Renderers stay passive:

- no ROS subscription;
- no backend fetch;
- no message decoding;
- only display prepared data from runtime adapters.

## Consequences

- Runtime adapters can evolve independently from renderer components.
- Frontend tests can validate debug widgets with deterministic sample data.
- The same debug widgets can later consume ROS, WebSocket, or mock data sources.

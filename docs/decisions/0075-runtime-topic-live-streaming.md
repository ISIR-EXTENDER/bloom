# 0075 - Runtime Topic Live Streaming

## Status

Accepted.

## Context

Bloom Debug needs more than subscription acknowledgements. Topic echo and lightweight plot widgets should receive live
runtime data while keeping ROS-specific behavior behind backend adapters.

The renderer pipeline already accepts widget data snapshots, so the missing part was the runtime transport:

- backend WebSocket subscriptions need to push topic samples, not only ACKs;
- ROS callbacks may run in a different thread from the FastAPI event loop;
- frontend renderers should stay reusable and should not know about ROS transport details.

## Decision

Runtime topic streaming uses a small explicit contract:

- client sends `subscribe_topic`;
- backend returns `subscription_ack`;
- backend then pushes `topic_sample` messages whenever samples arrive;
- the dashboard WebSocket client exposes sample listeners;
- `RuntimeWorkspace` maps topic samples to visible debug widgets and feeds `dataByWidgetId`;
- topic echo and topic plot renderers stay data-only and transport-agnostic.

In ROS mode, `run-ros` now spins rclpy in a background executor thread. ROS topic callbacks schedule sample delivery onto
the FastAPI event loop through `call_soon_threadsafe`, so the WebSocket queue is not touched directly from the ROS thread.

## Consequences

- Bloom can now support real topic echo and plot widgets as the first Bloom Debug runtime feature.
- The same pipeline can later feed rosbag topic selection, diagnostics screens, and runtime telemetry widgets.
- Non-ROS adapters can reuse the same `topic_sample` runtime shape.
- Renderers remain reusable across builder previews, runtime apps, and future app extensions.

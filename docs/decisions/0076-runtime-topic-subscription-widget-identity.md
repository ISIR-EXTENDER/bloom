# 0076 - Runtime Topic Subscription Widget Identity

## Status

Accepted.

## Context

Bloom Debug widgets subscribe to runtime topics from the frontend. The frontend includes `widget_id` in each
`subscribe_topic` message so acknowledgements, logs, and future diagnostics can be traced back to the widget that asked
for data.

During visual delivery capture, the app opened the runtime WebSocket but debug widgets stayed in a waiting state. The
backend was rejecting the subscription messages because the Pydantic model forbade the frontend `widget_id` field.

## Decision

`RuntimeSubscribeTopicMessage` accepts an optional `widget_id` and includes it in the `subscription_ack` payload.

Topic samples remain topic-based for now. Runtime workspace code maps samples to visible widgets by topic, which keeps
the sample event reusable for multiple widgets that observe the same topic.

## Consequences

- Bloom Debug runtime subscriptions now work from the real dashboard, not only from direct backend smoke tests.
- Future diagnostics can show which widget requested a subscription.
- The backend still forbids unknown fields outside the explicit runtime contract.

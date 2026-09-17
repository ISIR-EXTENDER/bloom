# 0134 - One topic subscription per socket, released by screen

**Status** accepted · **Date** 2026-09-17 · **Related** 0075 (runtime topic live streaming), 0076 (subscription widget
identity)

## Context

ADR 0076 keyed subscriptions by the widget that asked, so acknowledgements and logs trace back to a widget. The plot
kinds (plot board, picker, value strip) made several widgets share one topic, and the runtime routes samples by topic,
not by subscription. Two things followed:

- Opening Robot feedback, then Command sources, left two live subscriptions on `/cartesian_command`. Every message
  reached the board twice, which halved its visible history.
- Nothing was ever unsubscribed, so every screen an operator visited kept streaming for the life of the session and
  counted toward the per-session subscription limit.

## Decision

1. The runtime workspace holds **at most one subscription per topic per socket**. It asks only for topics it does
   not already hold, whichever widget asked first.
2. On a screen change it releases the topics the new screen does not show with a new client message,
   `unsubscribe_topic` (`topic`, `widget_id`). The server answers `unsubscription_ack` with `removed` true or false.
3. The server keys a handle by widget id **and** topic, so an unsubscribe closes exactly the handle it names, and a
   widget asking again for its own topic replaces its handle rather than stacking one.
4. A reconnect starts from nothing and subscribes again.

## Consequences

- A sample reaches each widget once, whatever screens were visited before.
- Samples stay routed by topic, so the first request's message type serves every widget on that topic. A widget that
  needs a different field reads it from the same message.
- The client and server must agree on the message: a frontend with this change sends `unsubscribe_topic`, which an
  older API answers with `runtime_error`. Bloom ships both halves together; the visual-smoke and tablet-layout mock
  servers answer it too, because replies are matched to requests by position.

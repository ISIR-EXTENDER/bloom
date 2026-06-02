# 0024. Widget Runtime Action Intents

## Status

Accepted

## Context

Bloom widgets now have registry metadata, settings contracts, layout helpers, legacy adapters, editor capabilities, and
pure editor operations. The next boundary is runtime behavior: a widget action should describe what it wants to do
without directly depending on React, ROS 2, HTTP, or storage.

This is especially important for widgets inherited from `extender_ui`, including configurable ROS message toggles that
publish a topic, message type, and ON/OFF payload.

## Decision

Add framework-independent widget action intents in the widgets package.

Supported intents start with:

- `command` for configured command buttons;
- `topic-publish` for widgets that publish a payload to a configured topic;
- `toggle-state` for local toggles with no output topic;
- `value-change` for scalar and vector input widgets;
- `unsupported` for display-only or invalid action combinations.

The runtime layer will consume these intents and choose the concrete adapter later.

## Consequences

- Widgets stay reusable across ROS and non-ROS projects.
- Runtime adapters do not need to understand every widget settings schema directly.
- The future app builder can test widget behavior without launching ROS.
- SQLite persistence remains a configuration concern, not a runtime action concern.

# 0016. Legacy Widget Kind Mapping

## Status

Accepted.

## Context

Bloom has a smaller generic widget vocabulary than the current `extender_ui` application. The legacy application also
mixes generic UI widgets, ROS/device-specific widgets, and Petanque-specific widgets in the same catalog.

## Decision

Add a framework-independent mapping in `@bloom/widgets` from enabled `extender_ui` widget kinds to Bloom widget kinds.
Each mapping carries a compatibility status:

- `direct` when the legacy kind already matches Bloom.
- `renamed` when the widget can migrate with naming/shape adaptation.
- `adapter-required` when runtime ROS, teleoperation, device, or recording behavior is needed first.
- `app-specific` when the widget should stay outside Bloom core until application extension points exist.
- `unsupported` when Bloom should keep the widget safe but unresolved.

## Consequences

Legacy configuration imports can be assessed without immediately migrating React components. Unsupported or
application-specific widgets remain explicit, which prevents hidden coupling from entering Bloom core during the
frontend migration.

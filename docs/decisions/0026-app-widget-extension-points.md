# 0026. App Widget Extension Points

## Status

Accepted

## Context

Legacy `extender_ui` configurations include simple generic widgets, complex reusable widgets, and occasional
application-owned behavior in the same canvas files. Bloom should preserve those widgets during migration without
assuming that every widget currently used by Petanque is Petanque-specific.

Several Petanque widgets are likely reusable lab primitives:

- gesture/draw controls for trajectory-like commands;
- stream/image viewers;
- measure/capture workflows;
- plots/curves;
- logs/event viewers;
- media/action buttons.

Those should become generic Bloom widgets when the reusable model is clear. Extension points are reserved for behavior
that is explicitly app-owned.

## Decision

Add framework-independent app widget extension metadata in `@bloom/widgets`.

The extension boundary includes:

- an app extension registry keyed by extension id;
- app-owned legacy widget kinds;
- optional renderer and runtime adapter keys;
- explicit missing-extension results when a widget explicitly declares an `appExtensionId` but no extension is registered.

Legacy canvas adapters now keep the source `legacyKind` in widget settings so extension resolution and generic
reclassification can happen later without losing the original widget identity.

## Consequences

- Legacy widgets remain visible and traceable in migrated screens.
- Complex Petanque-era widgets can graduate into generic Bloom widgets instead of being trapped in a Petanque extension.
- Missing explicit app extensions fail softly instead of crashing generic rendering.
- Generic widgets stay independent from Petanque or other project-specific code.
- Future React renderers and backend adapters can register app behavior through explicit keys.

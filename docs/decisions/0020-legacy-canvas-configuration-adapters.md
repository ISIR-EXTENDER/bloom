# 0020. Legacy Canvas Configuration Adapters

## Status

Accepted.

## Context

Bloom needs to migrate useful `extender_ui` canvas JSON files without losing layouts, widget settings, or unsupported
widgets. The legacy files use `rect: { x, y, w, h }`, camelCase canvas fields, and widget kinds that are more specific
than Bloom's generic widget vocabulary.

## Decision

Provide legacy canvas adapters that convert old screen JSON into Bloom's canonical screen configuration shape:

- old `rect` becomes widget `layout`;
- old `label` becomes widget `title`;
- old canvas `presetId` and `runtimeMode` become `preset_id` and `runtime_mode`;
- supported legacy widget kinds map to generic Bloom widget kinds;
- unsupported widgets stay visible as `unknown`;
- widget-specific fields are preserved in `settings`.

The backend adapter remains the canonical import path for persisted configurations. The frontend adapter exists as a
tested migration/helper seam for tools, demos, and future editor flows.

## Consequences

Legacy canvas files can feed Bloom without silently dropping widgets. JSON import/export remains a migration and backup
bridge, while canonical screen/app persistence can move toward SQLite.

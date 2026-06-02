# 0018. Widget Layout And Canvas Model

## Status

Accepted.

## Context

The legacy `extender_ui` canvas already supports moving, resizing, screen presets, runtime fit modes, and JSON-backed
screen layouts. Bloom needs to preserve those useful concepts while moving them into storage-neutral, tested domain
contracts that can later be persisted through SQLite.

## Decision

Add canonical widget layout and canvas settings to the configuration model:

- widgets own `layout: { x, y, width, height }`;
- screens own `canvas: { preset_id, runtime_mode }`;
- legacy `rect: { x, y, w, h }` is converted during legacy JSON import and removed from widget settings.

Mirror the contract in the frontend API client and expose framework-independent canvas helpers from `@bloom/widgets`:

- canvas presets;
- snap-to-grid behavior;
- preset size resolution;
- artboard growth when widgets exceed the preset;
- fit-scale calculation;
- legacy rect conversion.

## Consequences

Bloom can now build screen/editor features on top of a single layout model instead of duplicating canvas behavior inside
React components. The model is JSON serializable today and shaped for SQLite-backed screen/app persistence later.

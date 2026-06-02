# 0033. Legacy Configuration Bundle Import

## Status

Accepted

## Context

Bloom needs to migrate real `extender_ui` screens without losing widgets, layout, or application grouping.
Single-screen conversion is useful, but testing the migration as a full configuration bundle is closer to the future
SQLite persistence model.

## Decision

Add legacy helpers that convert multiple legacy canvas screens into:

- a Bloom `ApplicationConfig`;
- a Bloom `ConfigurationBundle` with metadata;
- screen ordering based on legacy application `screenIds` when available.

The conversion keeps unsupported widgets visible through safe `unknown` mappings instead of dropping them.

## Consequences

- Real legacy fixtures can be tested end to end as Bloom configuration bundles.
- Future database import flows can reuse the same canonical bundle shape.
- App-level migration stays separate from runtime adapters and renderer code.

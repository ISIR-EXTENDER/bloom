# 0017. Widget Capability Metadata

## Status

Accepted.

## Context

Bloom needs a widget foundation that can later power a palette, an inspector, runtime rendering, and app-specific
extensions. A registry that only stores `kind` and `displayName` is safe but not expressive enough for users to build
screens without coding.

## Decision

Extend widget definitions with framework-independent capability metadata:

- category;
- description;
- default title;
- default settings;
- default layout size;
- runtime requirements;
- editor/runtime availability.

Add default definitions for the current Bloom widget kinds and helper functions to create the default registry, list
definitions by category, and create widget config objects from capability defaults.

## Consequences

Future editor and renderer code can consume a single catalog contract instead of duplicating widget defaults across
React components, settings forms, and migration adapters. Runtime requirements also make adapter needs explicit without
coupling generic widgets directly to ROS.

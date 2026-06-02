# 0019. Widget Settings Contracts

## Status

Accepted.

## Context

Bloom widgets currently accept `settings: Record<string, unknown>` so the configuration model stays flexible and
storage-neutral. That flexibility is useful, but it is not enough for people who need to create screens without writing
web code. The future editor needs defaults, field metadata, and validation rules for each reusable widget kind.

## Decision

Add framework-independent widget settings contracts in `@bloom/widgets`.

Each contract defines:

- default settings;
- human-readable field metadata;
- validation with clear field-level errors;
- normalization from partial user/editor input.

Use lightweight TypeScript validators for now instead of introducing a schema dependency. The contracts remain
serializable and independent from React, ROS, and database storage.

## Consequences

The widget catalog can now create valid widget configurations from defaults, and future inspector forms can render fields
from a shared contract instead of duplicating widget knowledge. Runtime adapters can validate command/device widgets
before sending commands to backend or ROS layers.

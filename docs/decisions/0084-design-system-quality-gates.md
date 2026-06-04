# 0084 - Design System Quality Gates

Date: 2026-06-04

## Status

Accepted.

## Context

Bloom is becoming a reusable framework, not only a one-off Extender interface. The design system must therefore prevent
regressions early: contrast failures, tablet overflow, inconsistent repeated cards, and unclear icon usage should be
caught before users test with real robots.

## Decision

Add explicit design-system quality gates:

- automated contrast checks for every theme preset semantic text/background pair;
- visual smoke checks for `1024x600`, `1280x800`, and `1920x1080`;
- documented density modes: compact, tablet, comfortable, high-visibility;
- documented iconography rules before introducing many icons;
- a lightweight component styleguide that explains when patterns should move into `@bloom/ui`;
- reusable primitives for common actions, cards, panels, and metadata tags.

The visual smoke check focuses on stable assertions first: page availability, key headings/actions, and horizontal
overflow. Screenshot diff baselines can be added later once the UI stabilizes enough that pixel diffs become helpful
instead of noisy.

## Consequences

- Responsive issues become part of CI rather than manual tablet surprises.
- Pastel theme changes cannot silently ship unreadable text.
- The design system can grow intentionally instead of becoming a folder of random components.
- Bloom keeps room for visual evolution while protecting the core operator experience.


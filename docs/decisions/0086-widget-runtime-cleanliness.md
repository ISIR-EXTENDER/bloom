# 0086 - Widget Runtime Cleanliness

Date: 2026-06-04

Status: accepted

## Context

Bloom widgets serve two different contexts:

- operator runtime screens, where the user needs fast comprehension and touch comfort;
- debug/builder screens, where topic names, field paths, payloads, and sample counts are useful.

The first widget renderers exposed too much technical metadata by default. That was useful for development, but it makes
operator screens feel like logs or configuration panels.

## Decision

Runtime widgets should default to clean, user-facing labels. Technical details should be opt-in through explicit
settings such as `show_details`.

Applied now:

- command buttons render a configurable `button_label` or the widget title;
- toggles render configurable active/inactive labels instead of raw `ON` / `OFF`;
- toggle topics are hidden unless `show_details` is enabled;
- topic plot widgets can hide topic/field context while still showing useful sample feedback;
- camera status text is concise and operator-oriented.

## Consequences

- Screens can be simpler and more tablet-friendly by default.
- Bloom Debug can still expose technical details intentionally.
- Widget settings contracts must keep distinguishing "operator label" from "adapter configuration".

# 0031. Topic Telemetry Primitives

## Status

Accepted

## Context

`topic-plot` and `topic-echo` widgets need shared data handling before ROS adapters and polished renderers are added.
The foundations should be testable without ROS, React layout, or chart libraries.

## Decision

Add framework-agnostic telemetry primitives in `@bloom/widgets`:

- resolve nested field paths such as `velocity.angular.z` and `effort[1]`;
- append bounded topic echo messages with optional field extraction;
- format echo payloads for console-like displays;
- append numeric topic plot samples while trimming by sample count and history window.

These primitives operate on generic JSON-like topic messages.
ROS adapters will be responsible for subscribing and decoding messages before passing them to this layer.

## Consequences

- Plot and echo renderers can stay thin and deterministic.
- Runtime adapters can be tested independently from UI components.
- Bloom keeps a small in-app debug foundation without inheriting PlotJuggler complexity.

# 0030. Topic Debug Widget Contracts

## Status

Accepted

## Context

Robot interfaces need debugging and supervision screens, not only command screens.
Users should be able to watch velocities, torques, joint states, controller feedback, and arbitrary topic messages from
inside Bloom apps.

PlotJuggler is powerful, but Bloom needs a smaller in-app foundation that is easy to configure, persist, and reuse in
runtime screens.

## Decision

Introduce two generic debug widget kinds:

- `topic-plot`: a lightweight timeseries widget configured by topic, message type, field path, unit, history window,
  sample limit, and optional y-axis bounds.
- `topic-echo`: a console-like topic monitor configured by topic, message type, optional field path, message buffer size,
  and formatting mode.

These are generic Bloom widget contracts.
ROS subscriptions and message decoding stay in runtime data-source adapters, not in the React renderer or widget domain.

## Consequences

- Bloom can support debug/supervision screens without depending on local JSON sync or app-specific code.
- Future SQLite persistence can store topic debug widgets using the same configuration model as other widgets.
- Renderer work can start with safe placeholders, then evolve toward minimal PlotJuggler-like plots and in-app
  `ros2 topic echo` views.

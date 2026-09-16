# 0124 - Widget capability gating

Date: 2026-09-02

## Context

Reviewing Bloom, a colleague pointed out that the widget palette should only
offer widgets with a real connection behind them. He was right, and the state
was worse than the observation: without ROS attached a joystick placed happily
and moved nothing, and a plot sat on "Waiting for messages..." forever, which
looks exactly like a robot that has not started publishing yet.

The metadata to answer this already existed and was inert. `WidgetDefinition`
carried `runtimeRequirements` with seven values and **zero** readers.
`availability.editor` had one consumer that was redundant with the test beside
it, and `availability.runtime` had none. Three of the seven requirement values
named capabilities that no code implemented: `stream-source`,
`robot-model-source`, and `device-adapter`, whose `backend/libs/devices/`
contains only a README.

Several declarations were also simply wrong. `camera` declared `stream-source`
while running entirely in the browser and never contacting the backend at all.
`toggle` declared `device-adapter` while publishing to a topic like any other
command widget.

## Decision

**The backend reports what it can do.** `GET /api/v1/capabilities` returns each
runtime seam and whether it is really wired, derived from the gateway installed
on the app rather than from configuration. `create_app` already installs a Noop
per seam when nothing real is passed; this makes that visible.

**Requirements describe reality.** The three unimplemented capability values are
gone, so a widget can only declare something the backend can actually report.
Declarations were corrected to what each widget needs.

**Maturity is separate from availability.** `preview` says the widget is less
finished than its name suggests, independent of the backend: the 3D robot view
draws a joint-state summary rather than a model, and the event log is a topic
echo without severity handling. Each preview widget carries a note saying what
it does not do.

**Widgets are marked, not hidden.** A widget that cannot work here stays in the
palette with a "Not connected" flag and a line saying what it needs. Hiding it
would leave someone hunting for a widget that used to be there, and a screen is
often laid out before the robot is switched on, so placing one early is
legitimate.

**Unknown is not unavailable.** Before the capabilities have been fetched, or
against a backend too old to report them, widgets resolve to `unknown` and
nothing is flagged. Marking every ROS widget broken because a request has not
returned would be its own false claim.

## Also fixed

`NoopRuntimeTopicSubscriptionGateway` accepted a subscription and returned a
working handle, so the acknowledgement read "Subscribed to /joint_states" when
nothing could ever arrive. The ack now reports `live` and says plainly that no
subscriber is connected.

## Consequences

- The builder tells the truth about what will work before someone builds a
  screen on top of a widget that cannot.
- Requirements are now load-bearing, so adding a widget means saying what it
  needs, and a wrong answer is visible rather than inert.
- The capability list is the same vocabulary a robot profile would need, so this
  is a step toward `docs/architecture-robot-agnostic.md` rather than a detour.

## 2026-09-16 Amendment - runtime enforcement

Runtime now consumes the same readiness contract. An explicit missing seam marks the widget unavailable, keeps its
authored control visible under an inert content boundary, and overlays the backend's concrete reason. Runtime also
rejects intents from that widget, so a synthetic or stale event cannot bypass the visual state. A null capability report
still means unknown and disables nothing. Live validation covers both a ROS-ready session and a real no-ROS backend.

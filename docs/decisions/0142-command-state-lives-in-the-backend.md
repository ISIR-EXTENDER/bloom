# 0142 — Command state lives in the backend

Date: 2026-09-28

## Context

ADR 0141 ordered publishes on the server and taught each screen to reconcile what it asked for. Seven review rounds
still found buttons and toggles showing a state the robot might not have: after a lost reply, a reconnect, a STOP, a
second control or a second tablet on the same topic. The cause was structural. Each screen inferred the robot's state
from what it had sent, and that state was kept in five places (each widget, the client reconciler, the mode ledger,
the backend's session records and the resets STOP and a leave apply). Every combination was a new case.

The old `tablet_interface` backend did not have these bugs. It kept one state object on the server, pushed a full
snapshot to every socket twenty times a second, subscribed to its own command topics so presses from any source
showed up, and let a control it knew nothing about light neither side.

What the robot reports today (survey of the workspace, 2026-09-28):

- real feedback: parameters (`/parameter_events`, seeded with `get_parameters`), the Kinova gripper finger
  (`/joint_states`), the Petanque state machine (`/fsm_viewer`), arm pose and joints;
- indirect: visual servoing is on while `/visual_servoing/velocity_command` arrives (about 30 Hz);
- none: cartesian_manager's shaping mode, behaviour and targets, the qontrol speed limits, the hub digital outputs.
  The Explorer gripper servo does not stream its position.

## Decision

**The backend owns command state; screens render it.**

1. One store in the backend holds, per command target (a topic, a parameter, a named state such as the manager's
   shaping mode or behaviour), its value, where the value came from and a revision:
   - `measured`: read back from the robot (parameter events, `/joint_states`, `/fsm_viewer`, servoing liveness);
   - `commanded`: the last value published on the target's command topic by anyone. The backend subscribes to those
     topics as well as publishing them, so the joystick mapper, Petanque or another tablet show up too;
   - `reset`: set by the server itself (STOP, an operator leaving, a stale lease), which already publishes it;
   - `unknown`: never seen, or lost (a node restart, a pose target that ended on its own without a report).
   The manager's known transitions are modelled: a joint target is one-shot, a pose target returns to passthrough
   when reached.
2. The backend pushes the full store over the runtime socket on connect and on every change, and again at a fixed
   rate (2 Hz) so a missed message heals itself. Every screen, supervisor included, sees the same record.
3. A screen renders the store and nothing else. A press only sends the request: the control shows "sending" until
   the store moves or a short timeout passes, then shows whatever the store says. There are no client retries and
   no client inference; a lost reply does not matter, because the next push says what happened. A target the store
   holds as `unknown` lights neither side. A `commanded` value is shown as what was last asked for, not as a
   measurement.
4. Ordering (ADR 0141 section 1), allowlists, bounds, STOP gating and the leave and claim resets stay on the server
   as they are; they now also write the store.

**Feedback is added where the robot can give it.** cartesian_manager publishing its shaping mode, behaviour and
active target on a latched topic would turn the most-used controls from `commanded` to `measured`; this is asked
upstream. Speed limits and digital outputs stay `commanded` until their nodes report state.

## Consequences

- The client reconciler of ADR 0141 sections 2 and 3, the mode ledgers and per-widget confirmed state are removed.
  What a press shows no longer depends on reply timing, reconnects or which widget acted.
- The backend subscribes to a small fixed set of command and feedback topics for the store, independent of widget
  subscriptions.
- A control whose state the robot never reports says so: it shows what was last commanded, marked as such, or
  nothing when unknown.
- The randomized invariant test moves to the backend store: any interleaving of publishes, replies, STOP, leaves and
  reconnects must leave every socket's snapshot equal to the store, and the store equal to the reference model.

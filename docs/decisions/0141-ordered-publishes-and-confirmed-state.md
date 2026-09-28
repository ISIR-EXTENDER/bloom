# 0141 — Ordered publishes and confirmed state

Date: 2026-09-28

## Context

A button press, a toggle, a mode request or a Snake hold is an HTTP publish. The client gives up after 4 s, but
the server may still publish: a reply that never arrives does not mean the robot did nothing. Seven review rounds
on 2026-09-26 kept finding the same class of bug in new places:

- a servo switch, shaping toggle or Snake button reads off or released while the robot may be on or held;
- a timed-out mode request leaves the previous mode lit;
- a retry meant to release one mode undoes a newer choice, or is abandoned by a refused one;
- the server applies a delayed press after its release, because nothing orders two publishes.

Each patch fixed one widget and left the rule implicit, so the next patch broke it elsewhere. Two things were
missing: an order the server enforces, and a state the screen can show when it does not know.

## Decision

**1. The server applies publishes in the order the client issued them.** Every robot-facing HTTP request from a
runtime session (`POST /ros/topics/publish`, `POST /runtime/actions`) carries `X-Bloom-Publish-Seq`, an integer
that only grows within a page (the client's clock in milliseconds at load, plus one per request). Under the lease
operation lock, the server keeps the highest sequence it has applied per session and target (the topic, or the
preset's topic or service). A request whose sequence is not above it is not published and gets
`409` with `{"code": "superseded"}`. A request without the header is applied as before, so scripts and older
clients keep working. The record is dropped with the session.

**2. The screen keeps one state per robot target, fed by every act on it.** A target is a topic, or a node
parameter (`param:<node>:<name>`). Its state is what the robot is known to hold (a value, unknown, or nothing seen
yet) and the ordered list of acts with no definite answer. Every robot-facing act from any control (a toggle, a
latched mode button, a Snake hold, a one-shot, a preset, a slider, a parameter set) is recorded with its place in
the `X-Bloom-Publish-Seq` order just before its request goes out, and its outcome updates the target:

- accepted: if nothing newer is known, the robot holds its value (unknown for a payload no control compares); older
  acts can no longer change the robot;
- no reply (timeout, network error, 500, 502, 503 or 504): the act stays unanswered, since it may have been applied;
- refused (STOP latched, not the owner, 4xx, no ROS): removed, and what was known stands;
- superseded: removed with the acts before it; a rate limit (429) is not applied and waits for its retry.

The state does not depend on which control or app acted: the robot has one. A stateful control (toggle, latched mode
button, Snake) keeps sending its desired absolute payload until one send is accepted, retrying at 250 ms, 500 ms,
1 s, 2 s, then every 2 s while mounted, and for 60 s through its own app's handler once unmounted. Only the target's
newest act retries: any newer act there, from any control, ends older retries. One-shots (joint and pose targets)
never retry. A Snake hold ends without its release only once another control's newer act on its target is accepted
or has no reply; a refused one leaves the hold and its release owed.

STOP and suspend stop every pending retry except the neutral ones (servo off, a mode hold's release), so nothing is
re-applied after Resume. An asserted STOP sets the mode to geometric/both and the servo switch to off; a new session
or lease does the same, because the server resets only those, and leaves every other target (a gripper, a digital
output) as it was.

**3. The screen shows what it knows.** A control is clean only when nothing newer than what is known is unanswered
and what is known is one of its own payloads; otherwise it is *unconfirmed*: it shows its own desired state with a
"Not confirmed" mark (`data-confirmed="false"`) when the newest unanswered act is its own, and "Not confirmed" on
the last value seen otherwise, never plain off. Two controls on one target agree. After the fast retries it says
"Robot has not confirmed — STOP if in doubt". The mode highlight follows the same rule, per family: shaping
(geometric) and behaviour (passthrough, joint and pose targets) are kept apart, as the manager keeps them, and a mode
request without an accepted reply marks its family unknown, not the previous mode.

## Consequences

- A stale press can no longer be applied after its release; a release no longer has to guess whether it is still
  wanted. The per-widget hold generations, per-topic release guards, servo epochs and, on 2026-09-28, the
  per-widget claims and confirmed records are replaced by the sequence and the per-target state.
- Every stateful control converges on the last thing asked for, or says it has not.
- STOP and leaving still reset shaping, servoing and joint targets on the server; this decision covers the time
  in between.
- A lab script that publishes without the header keeps the old behaviour; the operator runtime always sends it.

## Amendment (2026-09-28)

Section 1 stands. Sections 2 and 3, the client-side state per target with its retries and "Not confirmed" marks, are
replaced by [ADR 0142](0142-command-state-lives-in-the-backend.md): the backend owns command state and every screen
renders its pushed snapshot. Parameter sets on `POST /ros/parameters/set` and service calls carry `X-Bloom-Publish-Seq`
too, ordered per node and parameter, or per service.

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

**2. A stateful control reconciles to what the operator asked for.** Toggles (servo, gripper, shaping, digital
outputs), latched mode buttons and the momentary Snake keep a *desired* state: the last thing the operator asked
for, or what a suspend, STOP or unmount asks for (off, released, neutral). The control keeps sending the desired
state, which is always an absolute payload and so safe to repeat, until one send is accepted:

- accepted: the state is **confirmed**;
- superseded: a newer send owns the topic, nothing to do;
- refused or no reply: retry at 250 ms, 500 ms, 1 s, 2 s, then every 2 s while the control is mounted, and on
  unmount hand the last desired state to a module-level reconciler that finishes it;
- a newer operator act replaces the desired state; the sequence makes any late send of the old one harmless.

**3. The screen shows what it knows.** A control is *confirmed* or *unconfirmed*. Unconfirmed shows the desired
state with a "Not confirmed" mark (`data-confirmed="false"`), never the old state and never plain off. After
the fast retries it says "Robot has not confirmed — STOP if in doubt". The requested-mode highlight follows the
same rule: a mode request without an accepted reply marks the mode unknown, not the previous one.

## Consequences

- A stale press can no longer be applied after its release; a release no longer has to guess whether it is still
  wanted. The per-widget hold generations, per-topic release guards and servo epochs added on 2026-09-26 are
  replaced by the sequence and the reconciler.
- Every stateful control converges on the last thing asked for, or says it has not.
- STOP and leaving still reset shaping, servoing and joint targets on the server; this decision covers the time
  in between.
- A lab script that publishes without the header keeps the old behaviour; the operator runtime always sends it.

# 0135 - A control lease holds only while its session is still talking

**Status** accepted · **Date** 2026-09-17 · **Related** 0129 (runtime control ownership lease)

## Context

ADR 0129 grants robot control to one connected WebSocket session and never evicts an owner: a claim from a second
session is refused while an owner is present, and the lease is released only by an explicit release or by the socket
closing.

A tablet that loses Wi-Fi does not close its socket. The TCP connection stays open on the backend until the operating
system gives up on it, which can take many minutes. For that whole time the backend believes an owner is present, so
no other tablet can take control and `POST /runtime/stop/resume` answers 409 to everyone. The room has an arm that
nobody can resume and a lease held by a device that is not in the building.

## Decision

A lease is held by a session that is still saying something.

1. The manager records the moment of every message a session sends on its socket, including `ping`.
2. A claim from another session takes the lease when the current owner, or a session stuck mid-release, has said
   nothing for **10 seconds**. Nothing else evicts an owner: a live owner is never displaced, and no queue promotes a
   waiting session by itself.
3. The dashboard sends `ping` every **3 seconds** while its socket is open, so an operator who is reading the screen
   and moving nothing is never treated as stale. Three pings fit inside the timeout.
4. STOP stays available to anyone with no lease at all, as before, and resume follows the lease, so the operator who
   takes over a stale lease can resume.

10 seconds sits between the two rhythms already in the runtime: the teleop input expires after 0.2 s on
`cartesian_manager`, and the dashboard polls status every 2 s. It is five status polls: long enough that a slow tablet
or a garbage-collection pause never loses control mid-task, short enough that the next operator does not stand in front
of a stopped arm waiting for a TCP timeout.

## Consequences

- A displaced owner is not neutralized on takeover, because it has published nothing for 10 seconds and the manager
  expired its last input after 0.2 s. The arm is already at zero before the lease moves.
- A tablet that comes back after 10 s of silence is no longer the owner. It sees `NOT IN CONTROL` and takes control
  again deliberately, which is the same path as any other handover.
- The dashboard and the backend must ship together: an older dashboard that never pings would lose control every
  10 s while idle. The mock runtime servers behind the visual smoke and tablet-layout checks answer `ping` too,
  because replies are matched to requests by position.
- Liveness counts WebSocket traffic only. An HTTP status poll does not renew the lease: the case this closes is a
  device that can reach neither.

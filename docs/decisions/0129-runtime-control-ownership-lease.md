# 0129 - Runtime control ownership lease

Date: 2026-09-16

## Context

Bloom can be opened from several tablets, tabs, or windows against one robot backend. Authentication says who may use
the API, but it does not decide which connected operator may command the robot right now. Without a backend ownership
boundary, two valid Runtime clients can interleave teleop, mode, gripper, service, camera, and recording operations.
Frontend-only disabling is insufficient because commands also use HTTP and a stale or modified client can bypass it.

A handover must also serialize with commands already in flight. Checking ownership at request entry and publishing a
final zero later leaves a race in which a previously authorized HTTP operation can reach the adapter after that zero.

## Decision

The backend grants robot control to at most one connected Runtime WebSocket session.

- A Runtime explicitly claims its opaque session ID. Claims never evict an owner and waiting sessions are not promoted
  automatically.
- Teleop and robot-facing HTTP operations require that lease. HTTP carries the session ID in
  `X-Bloom-Runtime-Session`; it remains separate from API-key authentication.
- Robot-facing HTTP operations pass a final execution gate held by the session manager. Release waits for operations
  already in that gate, then rejects later operations.
- Release enters a non-commanding transition, blocks new claims, and publishes zero for each teleop target whose last
  accepted command was nonzero. Only then does the owner disappear.
- Disconnect uses the same transition. If neutralization fails, Bloom latches runtime STOP before relinquishing the
  lease, even when STOP cannot fully assert through ROS.
- STOP engage and read do not require ownership. Resume does.
- The supervisor projection may read aggregate ownership state but cannot claim, release, or command.
- Production refuses `BLOOM_RUNTIME_CONTROL_REQUIRED=false`. Tests may disable enforcement when ownership is outside
  the contract under test.

## Consequences

A second Runtime is visibly inert and must retry after the owner leaves; there is no forced takeover or hidden queue.
The owner session ID is never disclosed to observers. A normal exit and an abrupt disconnect both have a server-owned
neutralization path, independent of browser cleanup.

The lease is process-local, so the robot-facing Bloom API must run as one process and one replica. A multi-process API
deployment would need one shared, failure-aware coordinator before it could preserve this guarantee. The lease also
does not replace API authentication, ROS security, controller limits, the hardware emergency stop, or live two-device
acceptance.

## Validation

Manager concurrency tests hold a command in flight while release starts, then prove that release waits, later commands
are rejected, and a waiting session cannot claim until completion. API tests cover exclusive claim, non-owner teleop
and HTTP rejection, universal STOP, owner-only resume, release-to-zero, disconnect fallback, and release-failure STOP.
Dashboard tests cover explicit claim/release, dynamic session headers, inert secondary Runtime UI, available STOP,
disabled non-owner resume, owner indication, and a supervisor projection with no mutation methods.

Repository evidence is recorded in `docs/validation/2026-09-16-runtime-control-ownership.md`.

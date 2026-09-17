# 0131 - Observer role

Date: 2026-09-17

## Context

The supervisor mirror (ADR 0128) was read-only because of the client it was handed, not because of who it was. It
authenticated with the operator key, so anyone at that screen held a credential that could command the arm. The
restraint lived in the browser, which is the wrong side of the wire.

## Decision

A third API key, `BLOOM_OBSERVER_API_KEY`, authenticates an observer.

- An observer may read saved applications, runtime control state, the STOP latch, the audit log, saved positions and
  the ROS topic catalog.
- An observer may open the runtime WebSocket, because live status and topic samples are what a mirror is for. The
  server refuses its claims, releases and teleop per message, with `observer_read_only`.
- Engaging STOP, resuming, publishing, calling services and dispatching actions need the operator role or above.
- A key shared by two roles grants the stronger one, so production refuses keys shared between roles and keys shorter
  than 32 characters.
- The runtime session id proves lease ownership on HTTP (ADR 0129), so no read returns another session's id. The audit
  log lists sessions by alias.

## Consequences

A second screen can watch a session with a credential that cannot move the arm, whoever reaches its keyboard. The
dashboard bakes its key in at build time, so a supervisor build is a separate build, served only to the machines meant
to watch. Bloom still has no per-person sign-in: the roles separate what a screen may do, not who is using it.

## Validation

`backend/tests/test_security.py` covers observer reads, refused commands over HTTP and the socket, the audit alias, and
the production key rules.

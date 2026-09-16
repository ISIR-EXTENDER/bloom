# Runtime Control Ownership Validation

Date: 2026-09-16

## Scope

This record validates Bloom's repository-level one-owner command boundary. It covers the backend lease, HTTP and
WebSocket enforcement, release ordering, frontend ownership UI, and the read-only supervisor projection.

## Automated Evidence

The following gates passed during implementation:

```bash
cd backend
make test                         # 334 passed

cd ..
npm test                         # 618 passed
npm run build
npm run check
npm run validation:frontend-backend
npm run validation:sandbox-runtime
npm run validation:extender
npm run validation:sandbox-tablet
npm run visual:smoke
```

Biome exited successfully with the same five pre-existing warnings: one test non-null assertion, one required scan
highlight `!important`, and three runtime-tour selector-order warnings.

The tests establish:

- only one connected Runtime session can own commands;
- a claim never evicts the current owner and disconnect never auto-promotes a waiter;
- release waits for an in-flight operation, blocks later operations and claims, neutralizes tracked nonzero teleop
  targets, and then makes ownership available;
- non-owner WebSocket teleop and robot-facing HTTP calls are rejected;
- STOP remains available without ownership, while resume requires it;
- failed release or disconnect neutralization latches STOP before ownership disappears;
- a failed explicit release reports the relinquished state to the browser, so its owner indicator cannot remain stale;
- the dashboard attaches its current WebSocket session to HTTP commands, blocks a second artboard, leaves STOP usable,
  preserves scan/dwell access to STOP and explicit retry, and disables non-owner resume;
- the supervisor can read aggregate ownership state but has no claim, release, or command method.

## Not Yet Proven

This is not live-robot, physical target-tablet, network-partition, or intended-operator acceptance. Multi-process
deployment is explicitly unsupported because the lease is process-local. Before a robot-facing release, run the
two-device handover and failed-neutralization checks in `docs/release-checklist.md` with the hardware emergency stop
available. Confirm the controller receives the old owner's zero before any command from the new owner.

# Legacy Retirement Gates

Bloom is intended to replace the old web/tablet workflow only when it is demonstrably safer, clearer, and accepted by
users. Until then, legacy repos and packages remain operational rollback paths.

## Current Legacy Status

Status: do not retire yet.

| Legacy area | Current role | Retirement status |
| --- | --- | --- |
| `extender_ui` | Proven canvas builder/runtime behavior and legacy widget UX reference. | Keep active until Bloom covers required app flows. |
| `input_interfaces/tablet_interface` | Proven ROS backend bridge and runtime behavior reference. | Keep active until Bloom ROS adapters cover required runtime flows. |
| Petanque app packages | Real Petanque runtime behavior, messages, state machine, and camera flow. | Keep active; Bloom candidate screens still need parity validation. |
| Extender low-level ROS packages | Controllers, robot interfaces, simulation, hardware and messages. | Not legacy for Bloom; Bloom consumes them through adapters. |

## Retirement Gates

A legacy workflow can only be marked legacy when all gates are complete:

- Functional parity: Bloom covers the required user workflow end-to-end.
- Runtime parity: Bloom emits the same robot-facing behavior or an intentionally accepted replacement.
- UX parity or improvement: operators can complete the workflow on the tablet without extra cognitive load.
- Safety parity or improvement: topic/message allowlists, rate limits, and audit records cover command paths.
- Rollback: the old workflow can still be launched during the transition window.
- Documentation: Bloom docs explain how to run the replacement and when to use rollback.
- User acceptance: the relevant operator/developer validates the workflow.

## What Not To Retire

Do not mark low-level robot packages as legacy just because Bloom exists. Bloom is a web product and adapter layer; it
does not replace controllers, robot interfaces, message packages, Gazebo/RViz launch files, or hardware integrations.

## Retirement Process

1. Link the accepted validation record from `docs/extender-petanque-validation.md`.
2. Open a PR that updates the legacy repo/package README or docs with a clear legacy notice.
3. Keep the repo/package available during the transition.
4. Only after the transition and team agreement, decide whether archiving is appropriate.

No deletion is part of Phase 5.

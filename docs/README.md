# Bloom Documentation

Current documentation map, reviewed 2026-09-16.

## Start Here

- [Project README](../README.md): setup, repository shape, shared applications, and common commands.
- [Operator runtime guide](operator-runtime.md): current kiosk behavior, controls, profiles, command frames, read-only
  supervisor mirror, and lab use.
- [Architecture](architecture.md): code boundaries, configuration ownership, and runtime composition.
- [Runtime flow compared with `extender_ui`](runtime-flow-vs-extender-ui.md): persistence, command dispatch, and ROS ownership.
- [Extender/Petanque validation](extender-petanque-validation.md): live acceptance procedure and what remains unvalidated.

## Build, Operate, And Deploy

- [Design system](design-system.md)
- [Component style guide](component-styleguide.md)
- [Widget UX review](widget-ux-review.md)
- [Accessibility plan](accessibility-plan.md)
- [Extender tablet hardware](extender-tablet-hardware.md)
- [Extender workspace deployment](extender-workspace-deployment.md)
- [Security baseline](security-baseline.md)
- [Release checklist](release-checklist.md)

## Product Status And Remaining Work

- [Bloom UX design handoff](ux-design-handoff.md)
- [Production readiness review](production-readiness-review.md)
- [Legacy retirement gates](legacy-retirement-gates.md)
- [Robot-agnostic architecture note](architecture-robot-agnostic.md)
- [Partner interface review](partner-interface-review.md)
- [Widget migration inventory](widget-migration-inventory.md)

## Evidence And History

- [`docs/decisions/`](decisions/): architectural decision records. Later implementation changes are added as dated
  amendments; the original decision context is retained.
- [`docs/validation/`](validation/): point-in-time evidence. A record states what passed on that date and must not be
  read as proof of later hardware acceptance.
- [Explorer tutorial media validation](validation/2026-09-16-explorer-tutorial-media.md): reproducible Joystick Lab
  screenshot and ROS-bench walkthrough evidence.
- [`docs/reviews/`](reviews/): dated review material and refactoring plans.
- [Bloom UX design handoff](ux-design-handoff.md): the tracked summary of the externally produced design-review folder,
  delivered behavior, and remaining work. Update this summary when the source folder is refreshed.

## Freshness Rules

- Bloom is the active IHM; `extender_ui` is a legacy reference and rollback path.
- Current behavior belongs in the README, operator guide, architecture, release checklist, and validation protocol.
- Design proposals must say that they are proposals and link to the current behavior they seek to change.
- Validation records are append-only evidence; add a new dated record instead of rewriting an old result.
- Test counts are intentionally not hard-coded in maintained guides. The command exit status is the release gate.
- Robot-facing claims must distinguish unit/contract, browser, bench, simulation, and live-hardware validation.

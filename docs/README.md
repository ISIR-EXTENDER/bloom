# Bloom Documentation

Current documentation map, reviewed 2026-09-17.

## Start Here

- [Project README](../README.md): setup, repository shape, shared applications, and common commands.
- [Operator runtime guide](operator-runtime.md): current kiosk behavior, single-session command ownership, controls,
  profiles, command frames, read-only supervisor mirror, and lab use.
- [Architecture](architecture.md): code boundaries, configuration ownership, and runtime composition.
- [Runtime flow compared with `extender_ui`](runtime-flow-vs-extender-ui.md): persistence, command dispatch, and ROS ownership.
- [Extender/Petanque validation](extender-petanque-validation.md): live acceptance procedure and what remains unvalidated.

## Build, Operate, And Deploy

- [Design system](design-system.md)
- [`docs/design/`](design/README.md): the design folder that ships with the code — the living
  [`design-system.html`](design/design-system.html) reference, [device classes](design/device-classes.md), the
  [widget minimum size contract](design/widget-min-size.md), the [pad recipe](design/pad-recipe.md), the screen specs
  under [`design/screens/`](design/screens/), and the [implementation plan](design/implementation-plan.md).
- [Component style guide](component-styleguide.md)
- [Widget UX review](widget-ux-review.md)
- [Accessibility plan](accessibility-plan.md)
- [Extender tablet hardware](extender-tablet-hardware.md)
- [Extender workspace deployment](extender-workspace-deployment.md)
- [Security baseline](security-baseline.md)
- [Release checklist](release-checklist.md)

## Product Status And Remaining Work

- [Bloom UX design handoff](ux-design-handoff.md)
- [Second UX design review plan](ux-design-review-2-plan.md): the work packages from the second handoff folder.
- [Production readiness review](production-readiness-review.md)
- [Release review 2026-09-17](release-review-2026-09-17.md): the pre-release pass, its findings and their outcome.
- [Legacy retirement gates](legacy-retirement-gates.md)
- [Robot-agnostic architecture note](architecture-robot-agnostic.md)
- [Partner interface review](partner-interface-review.md)
- [Widget migration inventory](widget-migration-inventory.md)
- [Widgets, screens and apps foundation plan](widgets-screens-apps-foundation-plan.md)

## Evidence And History

- [`docs/decisions/`](decisions/): architectural decision records. Later implementation changes are added as dated
  amendments; the original decision context is retained.
- [`docs/validation/`](validation/): point-in-time evidence. A record states what passed on that date and must not be
  read as proof of later hardware acceptance.
- [Explorer tutorial media validation](validation/2026-09-16-explorer-tutorial-media.md): reproducible Joystick Lab
  screenshot and ROS-bench walkthrough evidence.
- [ROS simulation end-to-end run](validation/ros-sim-e2e.md): `npm run e2e:sim` against simulated Explorer and Kinova
  arms, what it proves, and the Explorer launch workarounds to report upstream.
- [`docs/design/reviews/`](design/reviews/): the 2026-09-17 design reviews —
  [the Drive review](design/reviews/2026-09-17-drive.md) that produced the two Drive layouts,
  [the implementation review](design/reviews/2026-09-17-implementation.md) of the handoff, and
  [the design gap review](design/reviews/2026-09-17-design-gap-review.md) comparing the built app with the prototypes.
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

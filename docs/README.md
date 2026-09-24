# Bloom Documentation

Everything in `docs/`, and what each page is for. Reviewed 2026-09-24, for 0.3.0.

## Start Here

Three walkthroughs, in the order a newcomer needs them.

| | |
| --- | --- |
| [Getting started](tutorials/getting-started.md) | From a clone to a simulated Explorer or Kinova arm moving under your hand. Part one needs no ROS. |
| [Build your first app](tutorials/build-your-first-app.md) | Create an app, add a screen, place a joystick and a command button, allow their topics, pass the review checklist, open it in Runtime. |
| [Operate safely](tutorials/operate-safely.md) | The operator's page: roles, the kiosk bar, STOP and resume, maintenance, settings, and what to check before touching a control. |
| [Bench card](bench-card.md) | One page to work from during a session with a real arm: bring-up, the frame check, the Pivot sign, what only hardware can prove, and what is known-absent. |

The [project README](../README.md) covers installation, the repository shape, the shared applications, and the commands
CI runs.

## Reference

One page per topic. These describe what Bloom does today.

| page | what it answers |
| --- | --- |
| [Operator runtime](operator-runtime.md) | The canonical runtime contract: kiosk, ownership and handover, STOP, profiles and accessible input, command frames, telemetry, the supervisor mirror. |
| [Architecture](architecture.md) | Code boundaries, the save and load flow, the runtime action flow, and what may not import ROS. |
| [Design system](design-system.md) | Tokens, typography, density, touch targets, the component styleguide, and the rule for promoting a pattern into `@bloom/ui`. |
| [`docs/design/`](design/README.md) | The design folder that ships with the code: the living [`design-system.html`](design/design-system.html), [device classes](design/device-classes.md), the [widget minimum size contract](design/widget-min-size.md), the [pad recipe](design/pad-recipe.md), the screen specs under [`design/screens/`](design/screens/), and the [implementation plan](design/implementation-plan.md). |
| [Deployment and lab hardware](deployment.md) | The launcher, every environment variable, same-Wi-Fi access, recording, the ROS policy, and the tablet panel and its touch mapping. |
| [Security baseline](security-baseline.md) | The threat model, the controls enforced now, and the API perimeter. |
| [Accessibility plan](accessibility-plan.md) | The runtime accessibility contract, the motor and input profiles, and what is still open. |
| [Release checklist](release-checklist.md) | What has to be true before tagging. Every step is a command. |
| [Extender and Petanque validation](extender-petanque-validation.md) | The live acceptance procedure and what remains unvalidated on hardware. |
| [Visual servoing flow](validation/2026-09-24-visual-servoing-flow.md) | camera_interface review, the Visual servoing app, and the simulated end-to-end run of Robin's AprilTag flow. |

## Open Work And Proposals

| page | what it is |
| --- | --- |
| [UX design handoff](ux-design-handoff.md) | The tracked summary of the external design reviews: what landed, what is left, and what still needs live validation. The third handoff is tracked in [`docs/design/`](design/) instead. |
| [Legacy retirement gates](legacy-retirement-gates.md) | What each legacy path is still for, and the gates that must pass before one is removed. |
| [Robot-agnostic architecture note](architecture-robot-agnostic.md) | A design note, not a decision: where Bloom is and is not robot-independent. Written to be argued with. |

## Evidence And History

- [`docs/decisions/`](decisions/) — architectural decision records. A later change is added as a dated amendment; the
  original context is kept, and a record is never deleted. A superseded one says so in its own text and names what
  replaced it.
- [`docs/validation/`](validation/) — point-in-time evidence. A record states what passed on that date and is not proof
  of anything later. Two worth knowing: [the ROS simulation run](validation/ros-sim-e2e.md), which `npm run e2e:sim`
  reproduces for both robots, and
  [the Explorer tutorial media record](validation/2026-09-16-explorer-tutorial-media.md) behind the README's captures,
  and [the release hardening record](validation/2026-09-18-release-hardening.md) for what the reviews before 0.2.0
  found, fixed and left open, and [the defect audit](validation/2026-09-18-defect-audit.md) for what six
  concurrency, storage, runtime, widget, security and builder passes found after it, and
  [Robin's bench session](validation/2026-09-21-robin-bench.md), the first evidence from outside this
  repository.
- [`docs/design/reviews/`](design/reviews/) — the 2026-09-17 design reviews:
  [the Drive review](design/reviews/2026-09-17-drive.md) that produced the two Drive layouts,
  [the implementation review](design/reviews/2026-09-17-implementation.md) of the handoff, and
  [the design gap review](design/reviews/2026-09-17-design-gap-review.md) comparing the built app with the prototypes.
- [`docs/archive/`](archive/README.md) — reviews and plans that closed, kept as the record of what was found and what
  shipped. Nothing in there describes current behavior, and nothing in there is maintained.

## Freshness Rules

- Bloom is the active IHM; `extender_ui` is a legacy reference and rollback path.
- Current behavior belongs in the README, the tutorials, the operator guide, the architecture, the release checklist,
  and the validation protocol. One page owns a topic; the others link to it.
- Design proposals must say that they are proposals and link to the current behavior they seek to change.
- Validation records are append-only evidence; add a new dated record instead of rewriting an old result.
- Test counts are intentionally not hard-coded in maintained guides. The command exit status is the release gate.
- Robot-facing claims must distinguish unit/contract, browser, bench, simulation, and live-hardware validation.
- A tutorial names a command only after someone has run it, and a label only after someone has found it in the code or
  the seeds.

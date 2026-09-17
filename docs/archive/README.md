# Archive

Reviews and plans that did their job. They are kept because they record what was found, what was decided and what
shipped, and deleting them would delete the evidence. They are not maintained, and nothing here describes how Bloom
behaves today.

For current behavior read [the operator runtime guide](../operator-runtime.md), [the architecture](../architecture.md)
and [the documentation index](../README.md). Dated, reproducible test evidence lives in
[`docs/validation/`](../validation/), which is a different thing: those records are still cited as proof.

| file | what it was | what replaced it |
| --- | --- | --- |
| [2026-06-05-full-stack-refactoring-plan.md](2026-06-05-full-stack-refactoring-plan.md) | A full-stack review after the Phase 5 security, storage and runtime work, with an ordered refactoring plan. | The refactors landed. Boundaries are in `architecture.md`. |
| [2026-06-05-ux-review-and-fixes.md](2026-06-05-ux-review-and-fixes.md) | A tablet-first UX pass over the landing page, builder home, app configuration and runtime, with the fixes applied. | Superseded by the 2026-09-17 design reviews in [`docs/design/reviews/`](../design/reviews/). |
| [2026-09-17-release-review.md](2026-09-17-release-review.md) | The pre-release review of five areas before 0.2.0: every finding, where it was verified, and whether it was fixed. | All groups landed. The gates are in `release-checklist.md`. |
| [production-readiness-review.md](production-readiness-review.md) | A readiness table per product area, with the evidence each one still owed. | Open work moved to [`ux-design-handoff.md`](../ux-design-handoff.md); live acceptance to [`extender-petanque-validation.md`](../extender-petanque-validation.md). |
| [partner-interface-review.md](partner-interface-review.md) | A comparison of the Inria/AUCTUS `extender-interface` prototype with Bloom, to decide which of its ideas to take. | Decision 0065 took them. The Explorer User Tests app is the result. |
| [ux-design-review-2-plan.md](ux-design-review-2-plan.md) | The working plan for the second UX design handoff, lot by lot, with the commit that closed each one. | Every lot is done. The third handoff is tracked in [`docs/design/`](../design/). |
| [widget-ux-review.md](widget-ux-review.md) | A widget-by-widget review against tablet-first operator criteria. | The findings shipped. Widget geometry is now a contract in [`docs/design/widget-min-size.md`](../design/widget-min-size.md). |

Do not update a file in here. If one of them is still the best description of something, that is a sign the something
needs a current page.

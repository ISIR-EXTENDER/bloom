# Bloom Accessibility Plan

Bloom should be usable by people with different bodies, devices, contexts, and
levels of technical expertise. This matters even more for robotics: operators
may use a tablet in sunlight, under stress, with gloves, near moving hardware,
or while sharing attention with a real robot.

This plan follows the spirit of the GitHub Open Source Guide accessibility best
practices:

- document accessibility expectations;
- make contribution paths accessible;
- use semantic UI and clear language;
- make keyboard and focus behavior reliable;
- avoid using color as the only signal;
- test accessibility continuously instead of treating it as a late cleanup.

Reference: <https://opensource.guide/accessibility-best-practices-for-your-project/>

## Accessibility Statement

Bloom aims to be accessible by default for app builders, runtime operators, and
contributors. We target practical WCAG-inspired foundations first:

- readable text and sufficient contrast;
- keyboard reachable navigation and controls;
- visible focus states;
- semantic landmarks, headings, labels, status, and alert messages;
- touch targets that work on tablets;
- content that remains understandable without color alone;
- reduced cognitive noise in operator-facing screens.

Bloom is still in active foundation work. Accessibility issues should be filed
as normal product issues using the accessibility issue template, unless they are
security-sensitive.

## Quick Wins Already Required

- Every interactive control uses a semantic element (`button`, `input`,
  `select`, `textarea`, links for navigation only when appropriate).
- Buttons that only make sense through context need an accessible name.
- Forms use visible labels, not placeholder-only labels.
- Focus must be visible for keyboard users.
- Pages expose a skip link to jump from product navigation to the main content.
- Status and error feedback use `role="status"` or `role="alert"` where useful.
- Color accents must be paired with text labels, icons, grouping, or shape.
- Touch targets should stay at least 44 px high, with 48 px preferred for Bloom.
- Editable fields should expose touch-friendly keyboard hints. Names stay human
  and spellcheckable; URLs and structured ROS payloads disable autocorrect,
  autocapitalization, and unrelated browser autocomplete.

## Builder And Runtime Rules

- Builder pages must separate high-level choices from detail-heavy editing
  surfaces.
- Runtime apps should not show builder controls.
- Empty or unimplemented runtime screens must show a clear coming-soon state.
- Drag-and-drop interactions must keep accessible button fallbacks.
- App themes can change color palettes, but the theme system must preserve
  readable contrast and visible focus.
- Robot command widgets need clear labels, state, and confirmation/error
  feedback before being used with real hardware.
- App-builder text editing must stay usable on Raspberry/tablet targets for app
  names, screen names, widget labels, typed payloads, notes, and annotations.
  A custom virtual keyboard remains a future option, but only after validating
  that native OS/browser keyboards do not solve the target-device workflow.
- Current virtual-keyboard exploration decision: keep using native input
  controls with clear labels, touch-sized fields, and browser keyboard hints.
  Before building a custom keyboard, run a Raspberry/tablet hardware pass over
  app creation, app configuration, screen naming, widget labels, and ROS payload
  editing. Only add a Bloom keyboard if native input blocks those workflows.

## Documentation And Community Rules

- README content should use clear headings and descriptive links.
- Screenshots should include useful alt text.
- Pull requests should include an accessibility check when UI, docs, or
  interaction behavior changes.
- Accessibility bugs should be easy to report without needing expert vocabulary.
- New design-system decisions should note accessibility tradeoffs when relevant.

## Testing Roadmap

Current quick checks:

- component tests for visible labels, roles, statuses, and flows;
- Playwright screenshots for layout regressions;
- manual keyboard smoke checks during visual QA.

Next tests to add:

- automated accessibility scan in browser-level tests once pages stabilize;
- keyboard-only smoke test for builder navigation and screen editing;
- contrast checks for app theme presets;
- reduced-motion check for animated UI;
- screen-reader-friendly naming tests for widget controls.

## Open Accessibility Work

- Add a recurring keyboard smoke test for landing, builder overview, app config,
  screen builder, and runtime.
- Add theme validation so user-created palettes keep minimum contrast.
- Add accessible drag-and-drop fallbacks for app screen composition and widget
  placement.
- Add onboarding hints that can be dismissed and are reachable by keyboard.
- Keep README screenshots updated with meaningful alt text and captions.
- Validate the optional virtual keyboard or touch editing assistant on hardware
  demos where the native keyboard may not be practical.

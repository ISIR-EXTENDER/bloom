# 0061 - Slider Return-To-Center Is A Widget Setting

## Status

Accepted.

## Context

The legacy Extender UI used sliders for teleoperation axes. User feedback made
large tactile sliders useful, but teleop sliders also need a safe interaction
mode: after the operator releases the control, the command should return to the
neutral value.

Not every slider is a teleop command. Some sliders configure persistent values
such as thresholds, speed limits, or application parameters.

## Decision

Add `returnToCenter` to the generic slider settings contract. The default is
`false`, so regular configuration sliders keep their current behavior.

When `returnToCenter` is `true`, the runtime slider renderer recenters the value
after the interaction is committed or focus leaves the control, and emits a
final value-change intent with the neutral value.

## Consequences

- Teleop sliders can preserve the safer legacy behavior without making all
  sliders behave like commands.
- Runtime adapters still receive generic `value-change` intents.
- Future inspector UI can expose this as a human setting rather than a
  hard-coded widget variant.

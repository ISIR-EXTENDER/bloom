# 0136 — Sharing the arm with joystick_mapper

Date: 2026-09-22

## Context

Robin ran Bloom and `joystick_mapper` against the same Extender bench on 2026-09-21 and reported that a command
on Z came out as Rx, and that the two conflicted
([his session](../validation/2026-09-21-robin-bench.md)). Bloom's own chain is clean: Height maps to `linear_z`
and Pivot to `angular_z` at every hop. The conflict is in how the two reach the manager.

Read from `cartesian_manager` at `d4c6854`:

- **Two input sources exist**, and only two: `InputSource::JOYSTICK` and `InputSource::VISUAL_SERVOING`
  (`include/cartesian_manager/core/types.hpp:12`).
- **A command replaces, it does not accumulate.** `InputManager::setCommand` assigns
  `input->second.latest.command = command` (`src/core/input_manager.cpp:72`). Two publishers on one source
  overwrite each other, last writer wins.
- **`joystick_mapper` publishes on every `/joy` message**, unconditionally, including all-zeros when the stick
  is centred (`src/joystick_mapper.cpp:287-303`), to `/joystick_cartesian_command` — the topic Bloom teleop
  uses. So a centred physical stick streams zeros over Bloom's twist at `/joy` rate.
- **Across sources it averages, it does not sum.** `getFullCommand` accumulates `weight * command` and then
  divides by the total weight (`src/core/input_manager.cpp:203-214`), with `weight` fixed at `1.0`
  (`types.hpp:66`) and no parameter to change it.
- **Both topics are configurable**: `topics.joystick_command` and `topics.visual_servoing_command`, and the
  active set is `inputs.sources`, which on Explorer today is `[joystick]` alone
  (`bringup/config/explorer_params.yaml:48-67`).

## Decision

**Bloom keeps publishing to one teleop topic and does not try to share a channel.** Sharing
`InputSource::JOYSTICK` with a second node cannot be made to work from our side: the manager replaces per
source, so whichever published last wins, whatever Bloom does.

Two ways forward, neither of which needs a code change in Bloom:

**Today, by configuration on both sides.** Give Bloom its own source by borrowing the unused one:

```yaml
inputs:
  sources: [joystick, visual_servoing]
topics:
  visual_servoing_command: /bloom_cartesian_command
```

and point Bloom at that topic (`BLOOM_ALLOWED_TELEOP_TARGETS`, plus the app's own
`allowed_teleop_targets`). The manager then treats the two as different sources and combines them instead of
letting them overwrite, and each keeps its own frame, because `commandInBaseFrame` is applied per source.

The cost is the name and the arithmetic. Calling the tablet "visual servoing" is wrong in any log that reads
it, and **the average halves Bloom's command** while the mapper is publishing zeros: a centred stick is still
a valid input of 0, so full deflection on the tablet arrives as half speed.

**Properly, upstream.** A `tablet` value in the `InputSource` enum, its name in `inputSourceFromName`, and its
timeout in `makeInputConfig` — the three places `visual_servoing` already appears. That is the design
Mégane's architecture describes, where the tablet is a source in its own right. Worth asking for alongside two
things this reading turned up: per-source weights, and whether an input sitting at exactly zero should count
toward the average at all.

## Consequences

- Until one of those lands, **running both against one arm is a configuration mistake**, not a Bloom defect.
  The [bench card](../bench-card.md) says to stop one of them, and the operator guide says why.
- Bloom's browser-gamepad axis map is left alone. It is correct for the twin-stick pad it documents; the
  bench's three-axis stick means something different by axis 2, and deciding what a given stick should mean
  belongs to the deployment rather than to this repository.
- Nothing here changes what Bloom publishes. Only where it publishes it, and only when a deployment says so.

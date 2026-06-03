# 0070 - Runtime Foundation Contracts

## Status

Accepted.

## Context

The partner Explorer interface highlights useful runtime patterns that should
influence Bloom without making Bloom Explorer-specific:

- long-running robot actions with progress and cancel;
- Explorer mode-aware teleoperation;
- display/accessibility profiles;
- optional 3D robot visualization.

Bloom already has the mode-aware joystick contract and profile-ready
application model. The missing foundations were long-running action metadata and
a safe place for future 3D robot visualization.

## Decision

Add generic runtime action metadata to command intents:

- action id;
- human label;
- expected feedback mode;
- cancellable flag.

Add reusable lifecycle contract types for accepted/running/progress/result/cancel
states. These are contracts only; backend ROS/action adapters can implement them
later.

Reserve `robot-3d` as a recognized optional widget family with placeholder
rendering and typed settings. Explorer-specific URDF assets, joint-state
mappings, and bridge protocols must live in app configuration or extensions, not
in the generic widget core.

## Consequences

- Deploy/Repli-style flows can be modeled without hard-coding Explorer commands
  into Bloom.
- The renderer can show `robot-3d` widgets safely before a Three.js/URDF adapter
  exists.
- The migration roadmap can distinguish implemented contracts from future live
  adapters.

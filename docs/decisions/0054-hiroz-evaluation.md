# 0054 - Hiroz evaluation

## Context

Bloom aims to become a modern web app foundation for robot teleoperation and supervision while staying independent from
low-level ROS implementation choices.

`ZettaScaleLabs/hiroz` is relevant to watch because it is a Zenoh-native ROS 2 stack that provides pure-Rust ROS 2
primitives, Python and Go bindings, and interoperability with ROS 2 nodes using Zenoh middleware.

## Decision

Bloom should not adopt `hiroz` as a direct dependency during the current frontend/backend migration.

Bloom should keep its ROS boundary adapter-based, so a future `HirozRosAdapter` or `ZenohRosAdapter` can be evaluated
without changing widget contracts, API routes, screen/app storage, or frontend runtime code.

## Why Not Now

- Bloom currently targets Extender work that already runs with standard ROS 2 Python/C++ packages.
- `hiroz` is explicitly experimental and currently has a `0.1.0-rc` release profile.
- The strongest value of `hiroz` is transport/runtime architecture, not app-builder UX.
- Using it directly would add Rust, Zenoh router management, new packaging paths, and message compatibility concerns.
- Bloom's immediate migration risk is UI/runtime correctness, storage, and ROS adapter validation, not DDS replacement.

## What To Learn From Hiroz

- Keep transport behind a replaceable runtime adapter.
- Treat router-based discovery as a serious future option for multi-machine or cross-network deployments.
- Keep message contracts typed and introspectable.
- Make runtime communication testable without a full ROS installation where possible.
- Consider Zenoh or `rmw_zenoh_cpp` when Bloom needs better networking than local DDS multicast.

## Follow-Up Trigger

Revisit this decision when at least one of these becomes true:

- Bloom needs reliable cross-subnet, container, or multi-machine robot communication.
- Extender moves from Humble-only workflows toward Jazzy/Kilted.
- We need a runtime path that works without a full ROS installation.
- Standard DDS discovery becomes a concrete blocker for tablet/runtime deployments.

Until then, `hiroz` is a reference architecture and optional future adapter candidate, not a core Bloom dependency.

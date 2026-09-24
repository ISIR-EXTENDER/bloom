# Kinova simulation: the 7-dof task slows the arm under the same twist

Date: 2026-09-24. Stack: cartesian_manager `d9a1fa5`, qontrol_controllers `topic/isir_manager`.

`npm run e2e:sim -- --robot kinova` drives the Translation pad for 2.5 s at the Slow segment
(0.025 m/s) and expects `/ee_pose` to move more than 3 cm. Same Bloom, same manager, two qontrol
builds:

| qontrol | `translation-moves-ee-pose` |
| --- | --- |
| `a6382c1` (joint_target: use minimal angle) | 11.9 cm, 13/13 |
| `91309cc` (tip: `9a818f8` adds a 7-dof task to keep joint 3 straight) | 1.0 cm, 11/13 |

Bloom publishes the same 80 twists in both runs; the difference is the controller's response. The
controller solves a constrained QP, so a new task changes the solution rather than adding to it, and
the outcome need not be deterministic; three runs on the tip gave 1.0 cm each, one on `a6382c1` gave
11.9 cm. This is a behaviour change to understand, not a bug to report. `/qontrol_explorer/effort_overload`
also reads `true` for the whole run in Gazebo (estimated tip force above the 10 N `force_threshold`),
which the controller publishes but does not act on.

For Mégane: is the reduced Cartesian velocity on the gen3 the expected price of the joint-3 task, and
is the overload estimate meaningful in simulation? Until then the Kinova manager scenario reports the
two displacement checks as failed on the tip, and the check keeps its 3 cm floor so the answer shows.

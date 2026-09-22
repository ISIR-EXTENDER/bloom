# 2026-09-21 — Robin's bench session

Status: **first hardware evidence.** Robin tested Bloom against the Extender stack and recorded the result
himself, function by function. He confirmed separately, by message, that **the robot moved** under the runtime
with Explorer. This page keeps his results as he gave them and separates what was ours to fix from what was not.

Validator: Robin Gibaud. Source: his own spreadsheet, 19 items.

## What he found

**13 passed, 5 failed, 1 left blank.** The split is the finding:

| | Result |
| --- | --- |
| Explorer Manager, the shipped operator app | 8 of 9 |
| The Builder, authoring a new app | 4 of 8 |

Passing in the shipped app: the launcher, both joysticks, the Z and RZ sliders, max speed and max turn as
buttons, mode Jaco, mode snake, and `/joystick_command`. Passing in the Builder: a `v_max` slider, the camera,
a command button, and a plain toggle.

So the app Bloom ships works on the bench, and building your own did not. Every Builder widget on the
**publish** path worked and every one on the **teleop** path failed, which is what pointed at the policy.

## Item by item

| Robin's item | His note | What it was |
| --- | --- | --- |
| Builder — joystick | `command failed : Teleop command was rejected by ru…` | **Ours.** A new app declared no teleop target, and an app that declares none drives nothing. Publish inherits the deployment list; teleop did not. Fixed: the default is the manager's command topic, and both ends now agree that an explicitly empty list means none. |
| Builder — slider Z RZ | same | Same cause, same fix. |
| Builder — all widget | "Glass retourne toujours une erreur de taille en px trop petite" | **Ours.** The glass check fitted every screen to 1024×600 and held it to the 44 px touch floor whatever its class, so a desktop screen was scaled to a panel it will never run on and no authoring choice could satisfy it. Fixed: each class is judged at its own checked panel and its own floor. |
| Builder — Stop | "je ne trouve pas le bouton stop pas dans le builder" | **Ours, but not a defect.** There is no STOP to place: the runtime draws it and reserves its region. Nothing said so. The region now says it, and so does the tutorial. |
| Builder — Toggle pour gripper | "fonctionne pas, mais à approfondir de mon côté, j'ai surement pas paramétré" | **Ours.** His instinct was right about where, but the Builder could not reasonably be got right: payloads are ROS text, each message type wants a different shape, and a helper returning the right pair had existed unused since the widget was written. Changing the type now fills them. |
| App Explorer Manager — mode Both | "conflits lorsque `joystick_mapper` est utilisé en même temps que Bloom (commande sur Z, Bloom publie sur Rx)" | **Not a Bloom axis bug, and not mode Both.** See below. |
| App Explorer Manager — gripper button command | *(blank)* | Not recorded. Still open. |

## Mode Both, and the Z that came out as Rx

The widget chain is clean. Height maps to `linear_z` and Pivot to `angular_z` at every hop from the seed through
the composer to the `TwistStamped`, with no path from a linear component to an angular one. `geometric/both` runs
no shaper at all — it is the passthrough default, which is why the symptom surfaced there rather than under Jaco
or snake: nothing was masking the input.

Two real things collide instead.

- **Two readers, two meanings for one stick.** Bloom reads any pad the browser exposes with a twin-stick map that
  takes axis 2 as `angular.x`. The bench's three-axis stick, through `joystick_mapper`'s `b1` mode, takes axis 2
  as `linear_z`. The same push means different things to the two of them.
- **Two publishers, one channel.** `joystick_mapper` publishes to `/joystick_cartesian_command`, the topic Bloom
  teleop uses, and `cartesian_manager` keeps one command per input source and *replaces* it rather than summing.
  They overwrite each other, last writer wins, and a centred physical stick still streams zeros over Bloom's
  twist at `/joy` rate. Summing happens between sources, not within one.

Nothing was changed in the axis map. It is correct for the pad it documents, and deciding what a three-axis
bench stick should mean is a decision about the deployment rather than a defect to patch. The operator guide and
the [bench card](../bench-card.md) now say how the two collide and what to do: stop one of them.

One thing was wrong enough to change. Command sources labelled `/joystick_cartesian_command` **"This tablet"**.
That topic carries every publisher on it and ROS gives a subscriber no way to tell them apart, so the screen
built to answer "who is driving" was asserting an answer it cannot know. It names the topic now.

## What this session does and does not establish

**The arm moved.** Robin confirmed it by message, against Explorer, through the shipped runtime app. That is the
first time anything in this repository has been able to say so, and it retires the oldest caveat in it: every
claim until now was fixture, contract, browser or simulation evidence.

What it does not yet establish is *direction*. His sheet records functions as ok or nok, not which way the hand
went, so the one thing simulation has never been able to check is still unchecked:

- **The Pivot sign on an arm.** Bloom publishes Pivot's left end as `+angular.z`, meaning the hand turns left.
  Verified on the wire, and the arm has now moved, but nobody has recorded which way it turned. It is step 6 of
  the bench card for this reason.
- Kinova was not covered at all: no gripper values on the Robotiq, no Reset fault.
- The gripper **button** command was left blank.

## What QA learned

Every simulation check drives an app Bloom ships. Nobody had ever authored one and driven it, so both defects
that made the Builder unusable were invisible while `npm run e2e:sim` passed 12 of 12 on both robots. Two guards
now cover that seam — an app as the Builder creates it can drive the robot, and the widgets it places clear the
floor of the panel they are checked at — and both fail against the code as Robin found it.

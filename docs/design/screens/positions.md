# Screen — Positions

`manager_positions` · both robots · design option `3a`

A named pose is dispatched once and the manager goes quiet: no progress, no arrival, no failure
(ADR 0115). Every design decision on this screen follows from that single fact.

## Layout

Canvas 1280×720, bar 44. Stage `14–916`, bench rail `928–1266`.

| widget | kind | layout | note |
| --- | --- | --- | --- |
| `positions-poses-label` | label | 14,14 902×24 | carries the "no progress is reported" warning |
| `positions-library` | position-library | 14,50 902×420 | five 56 px rows visible |
| `positions-home` | command-button | 14,482 445×180 | confirm-press, 5 s arm |
| `positions-release` | command-button | 471,482 445×180 | destructive treatment |
| `positions-sent-label` | label | 928,14 338×24 | |
| `positions-target-echo` | topic-echo | 928,50 338×348 | the only honest feedback |
| **reserved** `stop` | runtime chrome | 928,410 338×252 | |

## Decisions

**The warning became a label, not a paragraph.** `positions-note` was a 1240×80 `label` holding a
sentence of prose at 20 px. Prose in a widget is not a control and it reads as boilerplate, which is
exactly how a warning gets ignored. It is now the group label above the list — the thing you read
while choosing.

**The list grew from 610×420 to 902×420.** A pose row is 56 px; at 610 wide the joint values
collided with the name. Five rows are visible, which is the honest capacity — a list that shows
three and scrolls implies there are only three.

**Go home is a confirm-press.** First tap arms for five seconds and the button goes pollen (a held
state that ends by itself, §02); second tap sends. The existing seed already sets
`confirm_press: true` with a 5 s timeout — this is the visual the setting always implied.

**Release keeps the destructive treatment.** Error container, error border, verb label. It cancels a
motion that is already happening, which is the one genuinely destructive action on the screen.

**The rail shows the payload, not a status.** `/joint_target_command` with an age in seconds. No
progress bar, no "moving…", no arrival tick — the manager publishes none of those, and inventing
them would be the worst failure available on this screen.

## Open

Saving a pose has no flow — capture, name, confirm. The current build offers no way to create one,
so the library can only ever show what was seeded.

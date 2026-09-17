# Screen — Joystick Lab

`manager_joystick_lab` · both robots · design option `3b`

The screen the UX design review was built on. It read well because its controls are grouped by what
the axis *is* rather than by what shape the control happens to be — the insight the whole Drive
redesign came from. It also carried eleven violations of the contract derived from it.

## Layout

Canvas 1280×720, bar 44. Stage `14–916`, bench rail `928–1266`.

| widget | kind | layout | note |
| --- | --- | --- | --- |
| `lab-frame-label` | label | 14,14 596×24 | |
| `lab-frame-base` | command-button | 14,46 140×88 | `hide_title` |
| `lab-frame-tool` | command-button | 166,46 140×88 | `hide_title` |
| `lab-frame-hybrid` | command-button | 318,46 140×88 | `hide_title` |
| `lab-frame-ft` | command-button | 470,46 140×88 | `hide_title` |
| `lab-mode-label` | label | 622,14 444×24 | |
| `lab-mode-both` | command-button | 622,46 140×88 | `hide_title` |
| `lab-mode-jaco` | command-button | 774,46 140×88 | `hide_title` |
| `lab-snake-hold` | command-button | 926,46 140×88 | `hide_title`, momentary |
| `lab-z` (Height) | slider vertical | 14,146 110×384 | overlaid title |
| `lab-translation` | joystick | 136,146 384×384 | pad 380 |
| `lab-rotation` | joystick | 532,146 384×384 | pad 380 |
| `lab-gripper` | toggle | 136,548 384×114 | title beside the button |
| `lab-rz` (Pivot) | slider horizontal | 532,548 384×114 | overlaid title |
| `lab-sent-label` | label | 928,146 338×24 | |
| `lab-sent` | topic-echo | 928,182 338×216 | |
| **reserved** `stop` | runtime chrome | 928,410 338×252 | |

## What was violated, and what it cost

| was | now | cost of the old value |
| --- | --- | --- |
| three labels at `h: 20` | 24 | at 12 px uppercase, 20 px cuts the descenders on "COMMAND" and "SHAPING" |
| four frame buttons `120×82` | 140×88 | 82 leaves 50 px for a 56 px target once padding is paid |
| three mode buttons `130×82` | 140×88 | same |
| `lab-gripper 298×82` + own label | 384×114, titled | the commanded state had nowhere to live |
| `lab-rotation 439×416` vs `lab-translation 440×516` | both 384×384 | two pads of the same kind at different sizes, one of them not square |
| `lab-rz 439×88` | 384×114 | 88 is below the horizontal slider minimum |
| `lab-sent 226×330` with `show_details` | 338×216 | a twist is eight lines of mono; at 226 px every line wrapped |
| no STOP | reserved `928,410 338×252` | the most safety-critical target was not on the screen |

## Decisions

**The frame moved into the kiosk bar as well as the button row.** The command frame is the single
thing most easily got wrong on this screen — a twist stamped `effector_frame` when you meant
`base_link` moves the arm somewhere else entirely. It now appears in the bar, in the button row, and
in the echo header, and switching it restamps the echo live.

**`show_details` comes off the pads.** The detail strip's information — axis map, topic, deadzone —
is what `lab-sent` shows in full, at a legible size. Two renderings of the same truth, one of them
cramped, is worse than one good one. Details stay on for `lab-sent` itself.

**Same column grid as `manager_drive_bench`:** Height 14, Translation 136, Rotation 532, rail 928.
A bench user switching between the two screens does not re-learn where anything is.

## Resolved — this screen stays separate from Drive · Bench

On the same grid, the Lab is Drive · Bench plus four frame buttons and a twist echo, minus the two
speed limits. That is what happens when a geometry contract removes the arbitrary differences
between two screens built for the same person.

Decided in review on 17 Sep 2026 (Susi): keep both. Both are debugging surfaces for the same
audience, so their similarity is correct rather than redundant — the Lab owns frame selection and
the twist echo, Bench owns the speed limits. Sharing a grid is the point: a bench user switching
between them re-learns nothing.

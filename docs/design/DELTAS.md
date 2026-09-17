# Seed geometry deltas

Generated from the transform applied to `backend/seed/applications/*.json`.
Corrected files: `docs/design/seed/`. Every new size satisfies `WIDGET_MIN_SIZE` (see `widget-min-size.md`).

One row is a code dependency rather than data: `settings.variant: "segments"` on the operator speed limits
needs the slider renderer to support segmented mode. Everything else is data-only and merges as-is.

| file | widget | field | before | after | why |
| --- | --- | --- | --- | --- | --- |
| `explorer-manager` | `drive-translation (bench)` | `layout` | 170,250 400×440 | **156,146 420×516** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-translation (bench)` | `settings.axes.x.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-translation (bench)` | `settings.axes.y.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-rotation (bench)` | `layout` | 610,250 400×440 | **588,146 400×400** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-rotation (bench)` | `settings.axes.x.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-rotation (bench)` | `settings.axes.y.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-max-linear-speed (bench)` | `layout` | 170,90 210×130 | **902,14 364×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-max-linear-speed (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-max-angular-speed (bench)` | `layout` | 400,90 210×130 | **1000,146 266×132** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-max-angular-speed (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-mode-both (bench)` | `layout` | 660,90 150×130 | **14,14 176×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-mode-both (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-mode-jaco (bench)` | `layout` | 830,90 150×130 | **202,14 176×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-mode-jaco (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-snake-hold (bench)` | `layout` | 1000,90 150×130 | **390,14 176×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-snake-hold (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-gripper (bench)` | `layout` | 20,90 130×130 | **590,14 300×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-gripper (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-gripper (bench)` | `settings.offLabel / onLabel` | "Open" / "Closed" | **"Close gripper" / "Open gripper"** | a button says what it does, not what is true |
| `explorer-manager` | `drive-z (bench)` | `layout` | 20,250 130×440 | **14,146 130×516** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-rz (bench)` | `layout` | 1110,250 130×260 | **588,558 400×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-rz (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-rz (bench)` | `settings.direction` | vertical | **horizontal** | angular axis reads left-to-right |
| `explorer-manager` | `drive-translation (operator)` | `layout` | 170,250 400×440 | **416,14 314×648** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-translation (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-translation (operator)` | `settings.axes.x.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-translation (operator)` | `settings.axes.y.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-rotation (operator)` | `layout` | 610,250 400×440 | **742,14 300×520** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-rotation (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-rotation (operator)` | `settings.axes.x.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-rotation (operator)` | `settings.axes.y.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `layout` | 170,90 210×130 | **14,14 268×144** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `settings.variant` | (continuous) | **segments** | REQUIRES renderer change — three 64px targets instead of fine motor control |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `layout` | 400,90 210×130 | **14,170 268×144** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `settings.variant` | (continuous) | **segments** | REQUIRES renderer change — three 64px targets instead of fine motor control |
| `explorer-manager` | `drive-mode-both (operator)` | `layout` | 660,90 150×130 | **14,326 268×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-mode-both (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-mode-jaco (operator)` | `layout` | 830,90 150×130 | **14,442 268×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-mode-jaco (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-snake-hold (operator)` | `layout` | 1000,90 150×130 | **14,558 268×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-snake-hold (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-gripper (operator)` | `layout` | 20,90 130×130 | **1054,14 212×168** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-gripper (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-gripper (operator)` | `settings.offLabel / onLabel` | "Open" / "Closed" | **"Close gripper" / "Open gripper"** | a button says what it does, not what is true |
| `explorer-manager` | `drive-z (operator)` | `layout` | 20,250 130×440 | **294,14 110×648** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-z (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-rz (operator)` | `layout` | 1110,250 130×260 | **742,546 300×116** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `explorer-manager` | `drive-rz (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `explorer-manager` | `drive-rz (operator)` | `settings.direction` | vertical | **horizontal** | angular axis reads left-to-right |
| `explorer-manager` | `profiles` | `preferred_control_layout_id` | "" on every profile | **operator/one-switch → manager_drive_operator, bench → manager_drive_bench** | the field already exists and was read by nothing |
| `explorer-manager` | `profiles` | `+ bench` | (2 profiles) | **(3 profiles: operator, bench, one-switch)** | role selection — ADR 0133 |
| `explorer-manager` | `lab-translation (manager_joystick_lab)` | `settings.axis_hints.x.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `lab-translation (manager_joystick_lab)` | `settings.axis_hints.y.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `lab-rotation (manager_joystick_lab)` | `settings.axis_hints.x.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `explorer-manager` | `lab-rotation (manager_joystick_lab)` | `settings.axis_hints.y.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-translation (bench)` | `layout` | 170,250 400×440 | **156,146 420×516** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-translation (bench)` | `settings.axes.x.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-translation (bench)` | `settings.axes.y.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-rotation (bench)` | `layout` | 610,250 400×440 | **588,146 400×400** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-rotation (bench)` | `settings.axes.x.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-rotation (bench)` | `settings.axes.y.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-max-linear-speed (bench)` | `layout` | 170,90 210×130 | **902,14 364×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-max-linear-speed (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-max-angular-speed (bench)` | `layout` | 400,90 210×130 | **1000,146 266×132** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-max-angular-speed (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-mode-both (bench)` | `layout` | 660,90 140×130 | **14,14 176×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-mode-both (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-mode-jaco (bench)` | `layout` | 820,90 140×130 | **202,14 176×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-mode-jaco (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-snake-hold (bench)` | `layout` | 980,90 140×130 | **390,14 176×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-snake-hold (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-gripper (bench)` | `layout` | 20,90 130×130 | **590,14 300×120** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-gripper (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-gripper (bench)` | `settings.offLabel / onLabel` | "Open" / "Closed" | **"Close gripper" / "Open gripper"** | a button says what it does, not what is true |
| `kinova-manager` | `drive-z (bench)` | `layout` | 20,250 130×440 | **14,146 130×516** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-rz (bench)` | `layout` | 1110,250 130×260 | **588,558 400×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-rz (bench)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-rz (bench)` | `settings.direction` | vertical | **horizontal** | angular axis reads left-to-right |
| `kinova-manager` | `drive-fault-reset (bench)` | `layout` | 1140,160 120×60 | **1000,290 266×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-translation (operator)` | `layout` | 170,250 400×440 | **416,14 314×648** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-translation (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-translation (operator)` | `settings.axes.x.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-translation (operator)` | `settings.axes.y.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-rotation (operator)` | `layout` | 610,250 400×440 | **742,14 300×520** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-rotation (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-rotation (operator)` | `settings.axes.x.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-rotation (operator)` | `settings.axes.y.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `layout` | 170,90 210×130 | **14,14 268×144** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `settings.variant` | (continuous) | **segments** | REQUIRES renderer change — three 64px targets instead of fine motor control |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `layout` | 400,90 210×130 | **14,170 268×144** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `settings.variant` | (continuous) | **segments** | REQUIRES renderer change — three 64px targets instead of fine motor control |
| `kinova-manager` | `drive-mode-both (operator)` | `layout` | 660,90 140×130 | **14,326 268×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-mode-both (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-mode-jaco (operator)` | `layout` | 820,90 140×130 | **14,442 268×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-mode-jaco (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-snake-hold (operator)` | `layout` | 980,90 140×130 | **14,558 268×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-snake-hold (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-gripper (operator)` | `layout` | 20,90 130×130 | **1054,14 212×168** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-gripper (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-gripper (operator)` | `settings.offLabel / onLabel` | "Open" / "Closed" | **"Close gripper" / "Open gripper"** | a button says what it does, not what is true |
| `kinova-manager` | `drive-z (operator)` | `layout` | 20,250 130×440 | **294,14 110×648** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-z (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-rz (operator)` | `layout` | 1110,250 130×260 | **742,546 300×116** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-rz (operator)` | `settings.show_details` | true | **false** | topic strings are not operator-actionable |
| `kinova-manager` | `drive-rz (operator)` | `settings.direction` | vertical | **horizontal** | angular axis reads left-to-right |
| `kinova-manager` | `drive-fault-reset (operator)` | `layout` | 1140,160 120×60 | **1054,194 212×104** | meet WIDGET_MIN_SIZE + sibling symmetry |
| `kinova-manager` | `drive-fault` | `screen + layout` | manager_drive 1140,90 120×60 | **manager_feedback 20,290 336×380** | topic-echo min is 226×200; a fault echo is diagnostic, not a drive control |
| `kinova-manager` | `feedback-pose / feedback-joints / feedback-manipulability` | `layout.x + width` | 20/376/732 × 336-338 wide | **376/676/976 × 288 wide** | make room for the relocated fault echo |
| `kinova-manager` | `profiles` | `preferred_control_layout_id` | "" on every profile | **operator/one-switch → manager_drive_operator, bench → manager_drive_bench** | the field already exists and was read by nothing |
| `kinova-manager` | `profiles` | `+ bench` | (2 profiles) | **(3 profiles: operator, bench, one-switch)** | role selection — ADR 0133 |
| `kinova-manager` | `lab-translation (manager_joystick_lab)` | `settings.axis_hints.x.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `lab-translation (manager_joystick_lab)` | `settings.axis_hints.y.color` | #4a9eff | **#7e967e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `lab-rotation (manager_joystick_lab)` | `settings.axis_hints.x.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |
| `kinova-manager` | `lab-rotation (manager_joystick_lab)` | `settings.axis_hints.y.color` | #e0685f | **#c98a7e** | non-token colour; pure blue / alarm red |


## Positions and Joystick Lab

Added in the second review pass, from the same tables that generate options `3a` and `3b`.

| file | widget | field | before | after | why |
| --- | --- | --- | --- | --- | --- |
| `explorer-manager` | `positions-note` | `removed` | 1240×80 label | **— replaced by a group label** | prose in a widget is not a control |
| `explorer-manager` | `positions-home (manager_positions)` | `layout` | 20,120 300×130 | **14,482 383×180** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `positions-release (manager_positions)` | `layout` | 340,120 300×130 | **409,482 383×180** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `positions-target-echo (manager_positions)` | `layout` | 650,270 420×420 | **804,50 462×348** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `positions-library (manager_positions)` | `layout` | 20,270 610×420 | **14,50 778×420** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `positions-poses-label (manager_positions)` | `added` | — | **14,14 778×24 label** | names the group the widgets below belong to |
| `explorer-manager` | `positions-sent-label (manager_positions)` | `added` | — | **804,14 462×24 label** | names the group the widgets below belong to |
| `explorer-manager` | `manager_positions` | `reserved_regions` | absent | **stop 804,410 462×252** | STOP is chrome in the same place on every screen — invariant 06 |
| `explorer-manager` | `lab-frame-base (manager_joystick_lab)` | `layout` | 14,36 120×82 | **14,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-frame-base (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-frame-tool (manager_joystick_lab)` | `layout` | 142,36 120×82 | **166,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-frame-tool (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-frame-hybrid (manager_joystick_lab)` | `layout` | 270,36 120×82 | **318,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-frame-hybrid (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-frame-ft (manager_joystick_lab)` | `layout` | 398,36 120×82 | **470,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-frame-ft (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-mode-both (manager_joystick_lab)` | `layout` | 540,36 130×82 | **622,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-mode-both (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-mode-jaco (manager_joystick_lab)` | `layout` | 678,36 130×82 | **774,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-mode-jaco (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-snake-hold (manager_joystick_lab)` | `layout` | 816,36 130×82 | **926,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-snake-hold (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `explorer-manager` | `lab-gripper-label` | `removed` | 298×20 label | **— replaced by a group label** | prose in a widget is not a control |
| `explorer-manager` | `lab-gripper (manager_joystick_lab)` | `layout` | 968,36 298×82 | **136,512 322×146** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-z (manager_joystick_lab)` | `layout` | 14,130 110×516 | **14,146 110×354** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-translation (manager_joystick_lab)` | `layout` | 136,130 440×516 | **136,146 322×354** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-rotation (manager_joystick_lab)` | `layout` | 588,130 439×416 | **470,146 322×354** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-rz (manager_joystick_lab)` | `layout` | 588,558 439×88 | **470,512 322×146** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-sent (manager_joystick_lab)` | `layout` | 1040,130 226×330 | **804,182 462×216** | WIDGET_MIN_SIZE + the bench column grid |
| `explorer-manager` | `lab-frame-label (manager_joystick_lab)` | `layout` | 14,14 504×20 | **14,14 596×24** | 20 px cuts the descenders at 12 px uppercase |
| `explorer-manager` | `lab-mode-label (manager_joystick_lab)` | `layout` | 540,14 406×20 | **622,14 444×24** | 20 px cuts the descenders at 12 px uppercase |
| `explorer-manager` | `lab-sent-label (manager_joystick_lab)` | `added` | — | **804,146 462×24 label** | names the group the widgets below belong to |
| `explorer-manager` | `manager_joystick_lab` | `reserved_regions` | absent | **stop 804,410 462×252** | STOP is chrome in the same place on every screen — invariant 06 |
| `kinova-manager` | `positions-note` | `removed` | 1240×80 label | **— replaced by a group label** | prose in a widget is not a control |
| `kinova-manager` | `positions-home (manager_positions)` | `layout` | 20,120 300×130 | **14,482 383×180** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `positions-release (manager_positions)` | `layout` | 340,120 300×130 | **409,482 383×180** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `positions-target-echo (manager_positions)` | `layout` | 650,270 420×420 | **804,50 462×348** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `positions-library (manager_positions)` | `layout` | 20,270 610×420 | **14,50 778×420** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `positions-poses-label (manager_positions)` | `added` | — | **14,14 778×24 label** | names the group the widgets below belong to |
| `kinova-manager` | `positions-sent-label (manager_positions)` | `added` | — | **804,14 462×24 label** | names the group the widgets below belong to |
| `kinova-manager` | `manager_positions` | `reserved_regions` | absent | **stop 804,410 462×252** | STOP is chrome in the same place on every screen — invariant 06 |
| `kinova-manager` | `lab-frame-base (manager_joystick_lab)` | `layout` | 14,36 120×82 | **14,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-frame-base (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-frame-tool (manager_joystick_lab)` | `layout` | 142,36 120×82 | **166,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-frame-tool (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-frame-hybrid (manager_joystick_lab)` | `layout` | 270,36 120×82 | **318,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-frame-hybrid (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-frame-ft (manager_joystick_lab)` | `layout` | 398,36 120×82 | **470,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-frame-ft (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-mode-both (manager_joystick_lab)` | `layout` | 540,36 130×82 | **622,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-mode-both (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-mode-jaco (manager_joystick_lab)` | `layout` | 678,36 130×82 | **774,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-mode-jaco (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-snake-hold (manager_joystick_lab)` | `layout` | 816,36 130×82 | **926,46 140×88** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-snake-hold (manager_joystick_lab)` | `settings.hide_title` | absent | **true** | sits under a group label; 140×88 derivation applies |
| `kinova-manager` | `lab-gripper-label` | `removed` | 298×20 label | **— replaced by a group label** | prose in a widget is not a control |
| `kinova-manager` | `lab-gripper (manager_joystick_lab)` | `layout` | 968,36 298×82 | **136,512 322×146** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-z (manager_joystick_lab)` | `layout` | 14,130 110×516 | **14,146 110×354** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-translation (manager_joystick_lab)` | `layout` | 136,130 440×516 | **136,146 322×354** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-rotation (manager_joystick_lab)` | `layout` | 588,130 439×416 | **470,146 322×354** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-rz (manager_joystick_lab)` | `layout` | 588,558 439×88 | **470,512 322×146** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-sent (manager_joystick_lab)` | `layout` | 1040,130 226×330 | **804,182 462×216** | WIDGET_MIN_SIZE + the bench column grid |
| `kinova-manager` | `lab-frame-label (manager_joystick_lab)` | `layout` | 14,14 504×20 | **14,14 596×24** | 20 px cuts the descenders at 12 px uppercase |
| `kinova-manager` | `lab-mode-label (manager_joystick_lab)` | `layout` | 540,14 406×20 | **622,14 444×24** | 20 px cuts the descenders at 12 px uppercase |
| `kinova-manager` | `lab-sent-label (manager_joystick_lab)` | `added` | — | **804,146 462×24 label** | names the group the widgets below belong to |
| `kinova-manager` | `manager_joystick_lab` | `reserved_regions` | absent | **stop 804,410 462×252** | STOP is chrome in the same place on every screen — invariant 06 |

66 further changes.

## Robot feedback and Command sources — rebuilt on the plot board

| file | widget | field | before | after | why |
| --- | --- | --- | --- | --- | --- |
| `explorer-manager` | `feedback-speed` | `removed from manager_feedback` | gauge 400×250 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `explorer-manager` | `feedback-cmd-x` | `removed from manager_feedback` | topic-plot 400×250 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `explorer-manager` | `feedback-cmd-z` | `removed from manager_feedback` | topic-plot 400×250 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `explorer-manager` | `feedback-pose` | `removed from manager_feedback` | topic-echo 336×380 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `explorer-manager` | `feedback-joints` | `removed from manager_feedback` | topic-echo 336×380 | **→ bloom-debug** | six widgets in a space that holds four at legible sizes |
| `explorer-manager` | `feedback-manipulability` | `removed from manager_feedback` | topic-plot 338×380 | **→ bloom-debug** | six widgets in a space that holds four at legible sizes |
| `explorer-manager` | `sources-note` | `removed from manager_sources` | label 1240×90 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `explorer-manager` | `sources-tablet` | `removed from manager_sources` | topic-plot 400×250 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `explorer-manager` | `sources-visual-servoing` | `removed from manager_sources` | topic-plot 400×250 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `explorer-manager` | `sources-sum` | `removed from manager_sources` | topic-plot 400×250 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `explorer-manager` | `sources-mode-log` | `removed from manager_sources` | topic-echo 610×290 | **→ mode-log 902×208** | three separate sparklines is the one layout that prevents comparison |
| `explorer-manager` | `sources-events` | `removed from manager_sources` | event-log 420×290 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `explorer-manager` | `manager_feedback / manager_sources` | `reserved_regions` | absent | **stop 928,410 338×252** | one bench rail on every screen |
| `kinova-manager` | `drive-fault` | `removed from manager_feedback` | topic-echo 336×380 | **→ bloom-debug** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `feedback-speed` | `removed from manager_feedback` | gauge 400×250 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `feedback-cmd-x` | `removed from manager_feedback` | topic-plot 400×250 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `feedback-cmd-z` | `removed from manager_feedback` | topic-plot 400×250 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `feedback-pose` | `removed from manager_feedback` | topic-echo 288×380 | **→ folded into plot-board** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `feedback-joints` | `removed from manager_feedback` | topic-echo 288×380 | **→ bloom-debug** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `feedback-manipulability` | `removed from manager_feedback` | topic-plot 288×380 | **→ bloom-debug** | six widgets in a space that holds four at legible sizes |
| `kinova-manager` | `sources-note` | `removed from manager_sources` | label 1240×90 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `kinova-manager` | `sources-tablet` | `removed from manager_sources` | topic-plot 400×250 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `kinova-manager` | `sources-visual-servoing` | `removed from manager_sources` | topic-plot 400×250 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `kinova-manager` | `sources-sum` | `removed from manager_sources` | topic-plot 400×250 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `kinova-manager` | `sources-mode-log` | `removed from manager_sources` | topic-echo 610×290 | **→ mode-log 902×208** | three separate sparklines is the one layout that prevents comparison |
| `kinova-manager` | `sources-events` | `removed from manager_sources` | event-log 420×290 | **→ folded into plot-board** | three separate sparklines is the one layout that prevents comparison |
| `kinova-manager` | `manager_feedback / manager_sources` | `reserved_regions` | absent | **stop 928,410 338×252** | one bench rail on every screen |

27 further changes. Two new widget kinds — `plot-board` and `plot-picker` — plus `value-strip`; see `screens/diagnostics.md`.

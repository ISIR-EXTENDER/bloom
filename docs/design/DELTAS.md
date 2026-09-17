# Seed geometry deltas

Generated from `backend/seed/applications/*-manager.json` before and after the design seed change.
The design seeds in `docs/design/seed/` were the input; the corrections applied on top of them are recorded
in `implementation-plan.md` §2 and §8. `manager_drive` became `manager_drive_bench` and `manager_drive_operator`.

| file | widget | field | before | after | why |
| --- | --- | --- | --- | --- | --- |
| `explorer-manager` | `bench-mode-label (bench)` | widget | — | **label 14,14 560×24** | new in the design |
| `explorer-manager` | `drive-gripper (bench)` | `layout` | 20,90 130×130 | **590,14 300×120** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-gripper (bench)` | `settings.offLabel` | Open | **Close gripper** | the button says what pressing does |
| `explorer-manager` | `drive-gripper (bench)` | `settings.offStateLabel` | — | **open** | the header names what was last commanded |
| `explorer-manager` | `drive-gripper (bench)` | `settings.onLabel` | Closed | **Open gripper** | the button says what pressing does |
| `explorer-manager` | `drive-gripper (bench)` | `settings.onStateLabel` | — | **closed** | the header names what was last commanded |
| `explorer-manager` | `drive-gripper (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `bench-speed-label (bench)` | widget | — | **label 928,14 338×24** | new in the design |
| `explorer-manager` | `drive-mode-both (bench)` | `layout` | 660,90 150×130 | **14,46 176×88** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-mode-both (bench)` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `drive-mode-both (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-mode-jaco (bench)` | `layout` | 830,90 150×130 | **202,46 176×88** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-mode-jaco (bench)` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `drive-mode-jaco (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-snake-hold (bench)` | `layout` | 1000,90 150×130 | **390,46 176×88** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-snake-hold (bench)` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `drive-snake-hold (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-z (bench)` | `layout` | 20,250 130×440 | **14,146 110×384** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-z (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-translation (bench)` | `layout` | 170,250 400×440 | **136,146 384×384** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-translation (bench)` | `settings.axes` | {"x": {"color": "#4a9eff", "negative_label": "X-", "posit… | **{"x": {"color": "#7e967e", "negative_label": "X-", "posit…** | series ramp token instead of a raw hex |
| `explorer-manager` | `drive-translation (bench)` | `settings.labels` | {"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"… | **{"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"…** | direction words, arrows bound to their word |
| `explorer-manager` | `drive-translation (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-rotation (bench)` | `layout` | 610,250 400×440 | **532,146 384×384** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-rotation (bench)` | `settings.axes` | {"x": {"color": "#e0685f", "negative_label": "RX-", "posi… | **{"x": {"color": "#c98a7e", "negative_label": "RX-", "posi…** | series ramp token instead of a raw hex |
| `explorer-manager` | `drive-rotation (bench)` | `settings.labels` | {"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ … | **{"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ …** | direction words, arrows bound to their word |
| `explorer-manager` | `drive-rotation (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-max-linear-speed (bench)` | `layout` | 170,90 210×130 | **928,146 338×120** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-max-linear-speed (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-max-angular-speed (bench)` | `layout` | 400,90 210×130 | **928,278 338×120** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-max-angular-speed (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-rz (bench)` | `layout` | 1110,250 130×260 | **532,548 384×114** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-rz (bench)` | `settings.direction` | vertical | **horizontal** | turning left reads left |
| `explorer-manager` | `drive-rz (bench)` | `settings.labels` | — | **{"negative": "↶ Turn left", "positive": "Turn right ↷"}** | direction words, arrows bound to their word |
| `explorer-manager` | `drive-rz (bench)` | `settings.runtime_binding` | {"adapter": "teleop", "target": "angular_z", "axis_mappin… | **{"adapter": "teleop", "target": "angular_z", "axis_mappin…** | +angular_z turns left, so the left end sends it |
| `explorer-manager` | `drive-rz (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `layout` | 170,90 210×130 | **14,14 264×150** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `title` | Max linear speed | **Max speed** | design wording |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `settings.segment_labels` | — | **["Slow", "Medium", "Fast"]** | three 64 px targets instead of fine motor control |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `settings.segment_values` | — | **[0.08, 0.15, 0.3]** | three 64 px targets instead of fine motor control |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-max-linear-speed (operator)` | `settings.variant` | — | **segments** | three 64 px targets instead of fine motor control |
| `explorer-manager` | `op-move-label (operator)` | widget | — | **label 290,14 436×24** | new in the design |
| `explorer-manager` | `op-aim-label (operator)` | widget | — | **label 738,14 314×24** | new in the design |
| `explorer-manager` | `drive-gripper (operator)` | `layout` | 20,90 130×130 | **1064,14 202×168** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-gripper (operator)` | `settings.offLabel` | Open | **Close gripper** | the button says what pressing does |
| `explorer-manager` | `drive-gripper (operator)` | `settings.offStateLabel` | — | **open** | the header names what was last commanded |
| `explorer-manager` | `drive-gripper (operator)` | `settings.onLabel` | Closed | **Open gripper** | the button says what pressing does |
| `explorer-manager` | `drive-gripper (operator)` | `settings.onStateLabel` | — | **closed** | the header names what was last commanded |
| `explorer-manager` | `drive-gripper (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-z (operator)` | `layout` | 20,250 130×440 | **290,46 110×346** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-z (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-z (operator)` | `settings.title_placement` | — | **above** | titles its row beside Translation |
| `explorer-manager` | `drive-translation (operator)` | `layout` | 170,250 400×440 | **412,46 314×346** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-translation (operator)` | `settings.axes` | {"x": {"color": "#4a9eff", "negative_label": "X-", "posit… | **{"x": {"color": "#7e967e", "negative_label": "X-", "posit…** | series ramp token instead of a raw hex |
| `explorer-manager` | `drive-translation (operator)` | `settings.labels` | {"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"… | **{"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"…** | direction words, arrows bound to their word |
| `explorer-manager` | `drive-translation (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-rotation (operator)` | `layout` | 610,250 400×440 | **738,46 314×346** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-rotation (operator)` | `settings.axes` | {"x": {"color": "#e0685f", "negative_label": "RX-", "posi… | **{"x": {"color": "#c98a7e", "negative_label": "RX-", "posi…** | series ramp token instead of a raw hex |
| `explorer-manager` | `drive-rotation (operator)` | `settings.labels` | {"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ … | **{"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ …** | direction words, arrows bound to their word |
| `explorer-manager` | `drive-rotation (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `layout` | 400,90 210×130 | **14,176 264×150** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `title` | Max angular speed | **Max turn** | design wording |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `settings.segment_labels` | — | **["Slow", "Medium", "Fast"]** | three 64 px targets instead of fine motor control |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `settings.segment_values` | — | **[0.2, 0.4, 0.8]** | three 64 px targets instead of fine motor control |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-max-angular-speed (operator)` | `settings.variant` | — | **segments** | three 64 px targets instead of fine motor control |
| `explorer-manager` | `op-mode-label (operator)` | widget | — | **label 14,338 264×24** | new in the design |
| `explorer-manager` | `drive-mode-both (operator)` | `layout` | 660,90 150×130 | **14,370 264×88** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-mode-both (operator)` | `title` | Neutral | **Neutral shaping** | design wording |
| `explorer-manager` | `drive-mode-both (operator)` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `drive-mode-both (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-rz (operator)` | `layout` | 1110,250 130×260 | **738,404 314×146** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-rz (operator)` | `settings.direction` | vertical | **horizontal** | turning left reads left |
| `explorer-manager` | `drive-rz (operator)` | `settings.labels` | — | **{"negative": "↶ Turn left", "positive": "Turn right ↷"}** | direction words, arrows bound to their word |
| `explorer-manager` | `drive-rz (operator)` | `settings.runtime_binding` | {"adapter": "teleop", "target": "angular_z", "axis_mappin… | **{"adapter": "teleop", "target": "angular_z", "axis_mappin…** | +angular_z turns left, so the left end sends it |
| `explorer-manager` | `drive-rz (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-mode-jaco (operator)` | `layout` | 830,90 150×130 | **14,470 264×88** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-mode-jaco (operator)` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `drive-mode-jaco (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `drive-snake-hold (operator)` | `layout` | 1000,90 150×130 | **14,570 264×88** | geometry from `screens/*.md` |
| `explorer-manager` | `drive-snake-hold (operator)` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `drive-snake-hold (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `positions-poses-label` | widget | — | **label 14,14 902×24** | new in the design |
| `explorer-manager` | `positions-sent-label` | widget | — | **label 928,14 338×24** | new in the design |
| `explorer-manager` | `positions-library` | `layout` | 20,270 610×420 | **14,50 902×420** | geometry from `screens/*.md` |
| `explorer-manager` | `positions-target-echo` | `layout` | 650,270 420×420 | **928,50 338×348** | geometry from `screens/*.md` |
| `explorer-manager` | `positions-target-echo` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `positions-home` | `layout` | 20,120 300×130 | **14,482 445×180** | geometry from `screens/*.md` |
| `explorer-manager` | `positions-home` | `title` | Home | **Go home** | design wording |
| `explorer-manager` | `positions-home` | `settings.button_label` | Go home | **Send Home** | action card words (3a) |
| `explorer-manager` | `positions-home` | `settings.hint` | — | **dispatched once — no progress is reported** | action card words (3a) |
| `explorer-manager` | `positions-release` | `layout` | 340,120 300×130 | **471,482 445×180** | geometry from `screens/*.md` |
| `explorer-manager` | `positions-release` | `settings.button_label` | Release | **Cancel the pose** | action card words (3a) |
| `explorer-manager` | `positions-release` | `settings.hint` | — | **returns the manager to passthrough** | action card words (3a) |
| `explorer-manager` | `feedback-plot-label` | widget | — | **label 14,14 902×24** | new in the design |
| `explorer-manager` | `feedback-plot` | widget | — | **plot-board 14,50 902×400** | new in the design |
| `explorer-manager` | `feedback-values` | widget | — | **value-strip 14,462 902×200** | new in the design |
| `explorer-manager` | `feedback-series-label` | widget | — | **label 928,14 338×24** | new in the design |
| `explorer-manager` | `feedback-series-picker` | widget | — | **plot-picker 928,50 338×348** | new in the design |
| `explorer-manager` | `sources-plot-label` | widget | — | **label 14,14 902×24** | new in the design |
| `explorer-manager` | `sources-plot` | widget | — | **plot-board 14,50 902×400** | new in the design |
| `explorer-manager` | `sources-mode-log` | `layout` | 20,400 610×290 | **14,454 902×208** | geometry from `screens/*.md` |
| `explorer-manager` | `sources-mode-log` | `settings.maxEntries` | — | **50** | mode log as 4b |
| `explorer-manager` | `sources-mode-log` | `settings.maxMessages` | 30 | **removed** | mode log as 4b |
| `explorer-manager` | `sources-mode-log` | `settings.newest_first` | — | **true** | mode log as 4b |
| `explorer-manager` | `sources-mode-log` | `settings.notes` | — | **{"geometric/both": "neutral shaping", "geometric/jaco": "…** | mode log as 4b |
| `explorer-manager` | `sources-mode-log` | `settings.prettyPrint` | false | **removed** | mode log as 4b |
| `explorer-manager` | `sources-mode-log` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `sources-series-label` | widget | — | **label 928,14 338×24** | new in the design |
| `explorer-manager` | `sources-series-picker` | widget | — | **plot-picker 928,50 338×348** | new in the design |
| `explorer-manager` | `lab-frame-label` | `layout` | 14,14 504×20 | **14,14 596×24** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-mode-label` | `layout` | 540,14 406×20 | **622,14 444×24** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-mode-label` | `title` | SHAPING MODE — requested, the manager never confirms | **SHAPING MODE — requested, never confirmed** | design wording |
| `explorer-manager` | `lab-mode-label` | `settings.text` | SHAPING MODE — requested, the manager never confirms | **SHAPING MODE — requested, never confirmed** | design seed |
| `explorer-manager` | `lab-frame-base` | `layout` | 14,36 120×82 | **14,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-frame-base` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-frame-tool` | `layout` | 142,36 120×82 | **166,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-frame-tool` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-frame-hybrid` | `layout` | 270,36 120×82 | **318,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-frame-hybrid` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-frame-ft` | `layout` | 398,36 120×82 | **470,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-frame-ft` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-mode-both` | `layout` | 540,36 130×82 | **622,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-mode-both` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-mode-jaco` | `layout` | 678,36 130×82 | **774,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-mode-jaco` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-snake-hold` | `layout` | 816,36 130×82 | **926,46 140×88** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-snake-hold` | `settings.hide_title` | — | **true** | grouped under a label |
| `explorer-manager` | `lab-z` | `layout` | 14,130 110×516 | **14,146 110×384** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-z` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `lab-translation` | `layout` | 136,130 440×516 | **136,146 384×384** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-translation` | `settings.axis_hints` | {"x": {"color": "#4a9eff", "negative_label": "X-", "posit… | **{"x": {"color": "#7e967e", "negative_label": "X-", "posit…** | series ramp token instead of a raw hex |
| `explorer-manager` | `lab-translation` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `lab-rotation` | `layout` | 588,130 439×416 | **532,146 384×384** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-rotation` | `settings.axis_hints` | {"x": {"color": "#e0685f", "negative_label": "RX-", "posi… | **{"x": {"color": "#c98a7e", "negative_label": "RX-", "posi…** | series ramp token instead of a raw hex |
| `explorer-manager` | `lab-rotation` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `lab-sent-label` | widget | — | **label 928,146 338×24** | new in the design |
| `explorer-manager` | `lab-sent` | `layout` | 1040,130 226×330 | **928,182 338×216** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-sent` | `title` | Sent to manager | **Twist** | design wording |
| `explorer-manager` | `lab-sent` | `settings.fieldPath` | twist | **** | the whole message keeps its frame id for the header |
| `explorer-manager` | `lab-sent` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `lab-gripper` | `layout` | 968,36 298×82 | **136,548 384×114** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-gripper` | `settings.layout` | — | **inline** | title and state beside the button |
| `explorer-manager` | `lab-gripper` | `settings.offLabel` | Open | **Close gripper** | the button says what pressing does |
| `explorer-manager` | `lab-gripper` | `settings.offStateLabel` | — | **open** | the header names what was last commanded |
| `explorer-manager` | `lab-gripper` | `settings.onLabel` | Closed | **Open gripper** | the button says what pressing does |
| `explorer-manager` | `lab-gripper` | `settings.onStateLabel` | — | **closed** | the header names what was last commanded |
| `explorer-manager` | `lab-rz` | `layout` | 588,558 439×88 | **532,548 384×114** | geometry from `screens/*.md` |
| `explorer-manager` | `lab-rz` | `settings.labels` | — | **{"negative": "↶ Turn left", "positive": "Turn right ↷"}** | direction words, arrows bound to their word |
| `explorer-manager` | `lab-rz` | `settings.runtime_binding` | {"adapter": "teleop", "target": "angular_z", "axis_mappin… | **{"adapter": "teleop", "target": "angular_z", "axis_mappin…** | +angular_z turns left, so the left end sends it |
| `explorer-manager` | `lab-rz` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `explorer-manager` | `positions-note` | widget | label on `manager_positions` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `feedback-speed` | widget | gauge on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `feedback-cmd-x` | widget | topic-plot on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `feedback-cmd-z` | widget | topic-plot on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `feedback-pose` | widget | topic-echo on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `feedback-joints` | widget | topic-echo on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `feedback-manipulability` | widget | topic-plot on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `sources-note` | widget | label on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `sources-tablet` | widget | topic-plot on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `sources-visual-servoing` | widget | topic-plot on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `sources-sum` | widget | topic-plot on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `sources-events` | widget | event-log on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `explorer-manager` | `lab-gripper-label` | widget | label on `manager_joystick_lab` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `bench-mode-label (bench)` | widget | — | **label 14,14 560×24** | new in the design |
| `kinova-manager` | `drive-gripper (bench)` | `layout` | 20,90 130×130 | **590,14 300×120** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-gripper (bench)` | `settings.offLabel` | Open | **Close gripper** | the button says what pressing does |
| `kinova-manager` | `drive-gripper (bench)` | `settings.offStateLabel` | — | **open** | the header names what was last commanded |
| `kinova-manager` | `drive-gripper (bench)` | `settings.onLabel` | Closed | **Open gripper** | the button says what pressing does |
| `kinova-manager` | `drive-gripper (bench)` | `settings.onStateLabel` | — | **closed** | the header names what was last commanded |
| `kinova-manager` | `drive-gripper (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `bench-speed-label (bench)` | widget | — | **label 928,14 338×24** | new in the design |
| `kinova-manager` | `drive-mode-both (bench)` | `layout` | 660,90 140×130 | **14,46 176×88** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-mode-both (bench)` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `drive-mode-both (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-mode-jaco (bench)` | `layout` | 820,90 140×130 | **202,46 176×88** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-mode-jaco (bench)` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `drive-mode-jaco (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-snake-hold (bench)` | `layout` | 980,90 140×130 | **390,46 176×88** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-snake-hold (bench)` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `drive-snake-hold (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-z (bench)` | `layout` | 20,250 130×440 | **14,146 110×384** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-z (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-translation (bench)` | `layout` | 170,250 400×440 | **136,146 384×384** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-translation (bench)` | `settings.axes` | {"x": {"color": "#4a9eff", "negative_label": "X-", "posit… | **{"x": {"color": "#7e967e", "negative_label": "X-", "posit…** | series ramp token instead of a raw hex |
| `kinova-manager` | `drive-translation (bench)` | `settings.labels` | {"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"… | **{"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"…** | direction words, arrows bound to their word |
| `kinova-manager` | `drive-translation (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-rotation (bench)` | `layout` | 610,250 400×440 | **532,146 384×384** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-rotation (bench)` | `settings.axes` | {"x": {"color": "#e0685f", "negative_label": "RX-", "posi… | **{"x": {"color": "#c98a7e", "negative_label": "RX-", "posi…** | series ramp token instead of a raw hex |
| `kinova-manager` | `drive-rotation (bench)` | `settings.labels` | {"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ … | **{"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ …** | direction words, arrows bound to their word |
| `kinova-manager` | `drive-rotation (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-max-linear-speed (bench)` | `layout` | 170,90 210×130 | **928,146 338×120** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-max-linear-speed (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-max-angular-speed (bench)` | `layout` | 400,90 210×130 | **928,278 338×120** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-max-angular-speed (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-rz (bench)` | `layout` | 1110,250 130×260 | **532,548 384×114** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-rz (bench)` | `settings.direction` | vertical | **horizontal** | turning left reads left |
| `kinova-manager` | `drive-rz (bench)` | `settings.labels` | — | **{"negative": "↶ Turn left", "positive": "Turn right ↷"}** | direction words, arrows bound to their word |
| `kinova-manager` | `drive-rz (bench)` | `settings.runtime_binding` | {"adapter": "teleop", "target": "angular_z", "axis_mappin… | **{"adapter": "teleop", "target": "angular_z", "axis_mappin…** | +angular_z turns left, so the left end sends it |
| `kinova-manager` | `drive-rz (bench)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-fault-reset (bench)` | `layout` | 1140,160 120×60 | **136,548 384×114** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `layout` | 170,90 210×130 | **14,14 264×150** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `title` | Max linear speed | **Max speed** | design wording |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `settings.segment_labels` | — | **["Slow", "Medium", "Fast"]** | three 64 px targets instead of fine motor control |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `settings.segment_values` | — | **[0.025, 0.05, 0.1]** | three 64 px targets instead of fine motor control |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-max-linear-speed (operator)` | `settings.variant` | — | **segments** | three 64 px targets instead of fine motor control |
| `kinova-manager` | `op-move-label (operator)` | widget | — | **label 290,14 436×24** | new in the design |
| `kinova-manager` | `op-aim-label (operator)` | widget | — | **label 738,14 314×24** | new in the design |
| `kinova-manager` | `drive-gripper (operator)` | `layout` | 20,90 130×130 | **1064,14 202×168** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-gripper (operator)` | `settings.offLabel` | Open | **Close gripper** | the button says what pressing does |
| `kinova-manager` | `drive-gripper (operator)` | `settings.offStateLabel` | — | **open** | the header names what was last commanded |
| `kinova-manager` | `drive-gripper (operator)` | `settings.onLabel` | Closed | **Open gripper** | the button says what pressing does |
| `kinova-manager` | `drive-gripper (operator)` | `settings.onStateLabel` | — | **closed** | the header names what was last commanded |
| `kinova-manager` | `drive-gripper (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-z (operator)` | `layout` | 20,250 130×440 | **290,46 110×346** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-z (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-z (operator)` | `settings.title_placement` | — | **above** | titles its row beside Translation |
| `kinova-manager` | `drive-translation (operator)` | `layout` | 170,250 400×440 | **412,46 314×346** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-translation (operator)` | `settings.axes` | {"x": {"color": "#4a9eff", "negative_label": "X-", "posit… | **{"x": {"color": "#7e967e", "negative_label": "X-", "posit…** | series ramp token instead of a raw hex |
| `kinova-manager` | `drive-translation (operator)` | `settings.labels` | {"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"… | **{"top": "▲ Forward", "bottom": "▼ Back", "left": "◀ Left"…** | direction words, arrows bound to their word |
| `kinova-manager` | `drive-translation (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-rotation (operator)` | `layout` | 610,250 400×440 | **738,46 314×346** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-rotation (operator)` | `settings.axes` | {"x": {"color": "#e0685f", "negative_label": "RX-", "posi… | **{"x": {"color": "#c98a7e", "negative_label": "RX-", "posi…** | series ramp token instead of a raw hex |
| `kinova-manager` | `drive-rotation (operator)` | `settings.labels` | {"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ … | **{"top": "▲ Tilt up", "bottom": "▼ Tilt down", "left": "◀ …** | direction words, arrows bound to their word |
| `kinova-manager` | `drive-rotation (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `layout` | 400,90 210×130 | **14,176 264×150** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `title` | Max angular speed | **Max turn** | design wording |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `settings.segment_labels` | — | **["Slow", "Medium", "Fast"]** | three 64 px targets instead of fine motor control |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `settings.segment_values` | — | **[0.2, 0.4, 0.8]** | three 64 px targets instead of fine motor control |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-max-angular-speed (operator)` | `settings.variant` | — | **segments** | three 64 px targets instead of fine motor control |
| `kinova-manager` | `drive-fault-reset (operator)` | `layout` | 1140,160 120×60 | **1064,194 202×104** | geometry from `screens/*.md` |
| `kinova-manager` | `op-mode-label (operator)` | widget | — | **label 14,338 264×24** | new in the design |
| `kinova-manager` | `drive-mode-both (operator)` | `layout` | 660,90 140×130 | **14,370 264×88** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-mode-both (operator)` | `title` | Neutral | **Neutral shaping** | design wording |
| `kinova-manager` | `drive-mode-both (operator)` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `drive-mode-both (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-rz (operator)` | `layout` | 1110,250 130×260 | **738,404 314×146** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-rz (operator)` | `settings.direction` | vertical | **horizontal** | turning left reads left |
| `kinova-manager` | `drive-rz (operator)` | `settings.labels` | — | **{"negative": "↶ Turn left", "positive": "Turn right ↷"}** | direction words, arrows bound to their word |
| `kinova-manager` | `drive-rz (operator)` | `settings.runtime_binding` | {"adapter": "teleop", "target": "angular_z", "axis_mappin… | **{"adapter": "teleop", "target": "angular_z", "axis_mappin…** | +angular_z turns left, so the left end sends it |
| `kinova-manager` | `drive-rz (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-mode-jaco (operator)` | `layout` | 820,90 140×130 | **14,470 264×88** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-mode-jaco (operator)` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `drive-mode-jaco (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-snake-hold (operator)` | `layout` | 980,90 140×130 | **14,570 264×88** | geometry from `screens/*.md` |
| `kinova-manager` | `drive-snake-hold (operator)` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `drive-snake-hold (operator)` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `positions-poses-label` | widget | — | **label 14,14 902×24** | new in the design |
| `kinova-manager` | `positions-sent-label` | widget | — | **label 928,14 338×24** | new in the design |
| `kinova-manager` | `positions-library` | `layout` | 20,270 610×420 | **14,50 902×420** | geometry from `screens/*.md` |
| `kinova-manager` | `positions-target-echo` | `layout` | 650,270 420×420 | **928,50 338×348** | geometry from `screens/*.md` |
| `kinova-manager` | `positions-target-echo` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `positions-release` | `layout` | 20,120 300×130 | **471,482 445×180** | geometry from `screens/*.md` |
| `kinova-manager` | `positions-release` | `settings.button_label` | Release | **Cancel the pose** | action card words (3a) |
| `kinova-manager` | `positions-release` | `settings.hint` | — | **returns the manager to passthrough** | action card words (3a) |
| `kinova-manager` | `feedback-plot-label` | widget | — | **label 14,14 902×24** | new in the design |
| `kinova-manager` | `feedback-plot` | widget | — | **plot-board 14,50 902×400** | new in the design |
| `kinova-manager` | `feedback-values` | widget | — | **value-strip 14,462 902×200** | new in the design |
| `kinova-manager` | `feedback-series-label` | widget | — | **label 928,14 338×24** | new in the design |
| `kinova-manager` | `feedback-series-picker` | widget | — | **plot-picker 928,50 338×348** | new in the design |
| `kinova-manager` | `sources-plot-label` | widget | — | **label 14,14 902×24** | new in the design |
| `kinova-manager` | `sources-plot` | widget | — | **plot-board 14,50 902×400** | new in the design |
| `kinova-manager` | `sources-mode-log` | `layout` | 20,400 610×290 | **14,454 902×208** | geometry from `screens/*.md` |
| `kinova-manager` | `sources-mode-log` | `settings.maxEntries` | — | **50** | mode log as 4b |
| `kinova-manager` | `sources-mode-log` | `settings.maxMessages` | 30 | **removed** | mode log as 4b |
| `kinova-manager` | `sources-mode-log` | `settings.newest_first` | — | **true** | mode log as 4b |
| `kinova-manager` | `sources-mode-log` | `settings.notes` | — | **{"geometric/both": "neutral shaping", "geometric/jaco": "…** | mode log as 4b |
| `kinova-manager` | `sources-mode-log` | `settings.prettyPrint` | false | **removed** | mode log as 4b |
| `kinova-manager` | `sources-mode-log` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `sources-series-label` | widget | — | **label 928,14 338×24** | new in the design |
| `kinova-manager` | `sources-series-picker` | widget | — | **plot-picker 928,50 338×348** | new in the design |
| `kinova-manager` | `lab-frame-label` | `layout` | 14,14 504×20 | **14,14 596×24** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-mode-label` | `layout` | 540,14 406×20 | **622,14 444×24** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-mode-label` | `title` | SHAPING MODE — requested, the manager never confirms | **SHAPING MODE — requested, never confirmed** | design wording |
| `kinova-manager` | `lab-mode-label` | `settings.text` | SHAPING MODE — requested, the manager never confirms | **SHAPING MODE — requested, never confirmed** | design seed |
| `kinova-manager` | `lab-frame-base` | `layout` | 14,36 120×82 | **14,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-frame-base` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-frame-tool` | `layout` | 142,36 120×82 | **166,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-frame-tool` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-frame-hybrid` | `layout` | 270,36 120×82 | **318,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-frame-hybrid` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-frame-ft` | `layout` | 398,36 120×82 | **470,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-frame-ft` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-mode-both` | `layout` | 540,36 130×82 | **622,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-mode-both` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-mode-jaco` | `layout` | 678,36 130×82 | **774,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-mode-jaco` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-snake-hold` | `layout` | 816,36 130×82 | **926,46 140×88** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-snake-hold` | `settings.hide_title` | — | **true** | grouped under a label |
| `kinova-manager` | `lab-z` | `layout` | 14,130 110×516 | **14,146 110×384** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-z` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `lab-translation` | `layout` | 136,130 440×516 | **136,146 384×384** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-translation` | `settings.axis_hints` | {"x": {"color": "#4a9eff", "negative_label": "X-", "posit… | **{"x": {"color": "#7e967e", "negative_label": "X-", "posit…** | series ramp token instead of a raw hex |
| `kinova-manager` | `lab-translation` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `lab-rotation` | `layout` | 588,130 439×416 | **532,146 384×384** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-rotation` | `settings.axis_hints` | {"x": {"color": "#e0685f", "negative_label": "RX-", "posi… | **{"x": {"color": "#c98a7e", "negative_label": "RX-", "posi…** | series ramp token instead of a raw hex |
| `kinova-manager` | `lab-rotation` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `lab-sent-label` | widget | — | **label 928,146 338×24** | new in the design |
| `kinova-manager` | `lab-sent` | `layout` | 1040,130 226×330 | **928,182 338×216** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-sent` | `title` | Sent to manager | **Twist** | design wording |
| `kinova-manager` | `lab-sent` | `settings.fieldPath` | twist | **** | the whole message keeps its frame id for the header |
| `kinova-manager` | `lab-sent` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `lab-gripper` | `layout` | 968,36 298×82 | **136,548 384×114** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-gripper` | `settings.layout` | — | **inline** | title and state beside the button |
| `kinova-manager` | `lab-gripper` | `settings.offLabel` | Open | **Close gripper** | the button says what pressing does |
| `kinova-manager` | `lab-gripper` | `settings.offStateLabel` | — | **open** | the header names what was last commanded |
| `kinova-manager` | `lab-gripper` | `settings.onLabel` | Closed | **Open gripper** | the button says what pressing does |
| `kinova-manager` | `lab-gripper` | `settings.onStateLabel` | — | **closed** | the header names what was last commanded |
| `kinova-manager` | `lab-rz` | `layout` | 588,558 439×88 | **532,548 384×114** | geometry from `screens/*.md` |
| `kinova-manager` | `lab-rz` | `settings.labels` | — | **{"negative": "↶ Turn left", "positive": "Turn right ↷"}** | direction words, arrows bound to their word |
| `kinova-manager` | `lab-rz` | `settings.runtime_binding` | {"adapter": "teleop", "target": "angular_z", "axis_mappin… | **{"adapter": "teleop", "target": "angular_z", "axis_mappin…** | +angular_z turns left, so the left end sends it |
| `kinova-manager` | `lab-rz` | `settings.show_details` | true | **false** | details belong to Bloom Debug |
| `kinova-manager` | `drive-fault` | widget | topic-echo on `manager_drive` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `positions-note` | widget | label on `manager_positions` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `feedback-speed` | widget | gauge on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `feedback-cmd-x` | widget | topic-plot on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `feedback-cmd-z` | widget | topic-plot on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `feedback-pose` | widget | topic-echo on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `feedback-joints` | widget | topic-echo on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `feedback-manipulability` | widget | topic-plot on `manager_feedback` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `sources-note` | widget | label on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `sources-tablet` | widget | topic-plot on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `sources-visual-servoing` | widget | topic-plot on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `sources-sum` | widget | topic-plot on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `sources-events` | widget | event-log on `manager_sources` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |
| `kinova-manager` | `lab-gripper-label` | widget | label on `manager_joystick_lab` | **removed** | replaced by the plot board, a group label, or moved to Bloom Debug |

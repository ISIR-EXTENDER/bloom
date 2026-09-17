# Screens — Robot feedback and Command sources

`manager_feedback`, `manager_sources` · both robots · design options `4a`, `4b`

Both screens declared six widgets and hold four at legible sizes. They fitted only because the
echoes ran 15 px type in 336×380 boxes and the plots were 400×250 traces nobody can read a
30-second history from. Rather than shrink them further or split each into two screens, both are
rebuilt on one pattern.

## The plot board

One large plot, N series over a shared time axis, a picker beside it that doubles as the legend.
This is the shape of the tool the lab already uses for exactly this task.

```
plot-board      settings.series[] = { topic, message_type, field_path, label, color, unit, enabled, emphasis }
                history_seconds, max_samples, y_min, y_max
                picker: { enabled, persist_per_profile }
plot-picker     settings.plot_id, show_value, show_unavailable
value-strip     settings.series[] = { topic, field_path, label, unit, color }
```

`emphasis: true` draws a series at double stroke weight. On Command sources the manager output
carries it, because that series is the answer and the other two are the candidates.

Minimum sizes: `plot-board` **480×280** (below that a 30-second window is decoration),
`plot-picker` **260×200** (a 48 px row plus a header), `value-strip` **440×140** (a 40 px numeral
plus label, topic and unit).

## Robot feedback — `4a`

| widget | kind | layout |
| --- | --- | --- |
| `feedback-plot-label` | label | 14,14 902×24 |
| `feedback-plot` | plot-board | 14,50 902×400 |
| `feedback-values` | value-strip | 14,462 902×200 |
| `feedback-series-label` | label | 928,14 338×24 |
| `feedback-series-picker` | plot-picker | 928,50 338×348 |
| **reserved** `stop` | runtime chrome | 928,410 338×252 |

Series: `/ee_velocity twist.linear.x`, `/cartesian_command twist.linear.x`,
`/cartesian_command twist.angular.z`, `/ee_pose pose.position.z`. The first two default on.

## Command sources — `4b`

| widget | kind | layout |
| --- | --- | --- |
| `sources-plot-label` | label | 14,14 902×24 |
| `sources-plot` | plot-board | 14,50 902×400 |
| `sources-mode-log` | event-log | 14,454 902×208 |
| `sources-series-label` | label | 928,14 338×24 |
| `sources-series-picker` | plot-picker | 928,50 338×348 |
| **reserved** `stop` | runtime chrome | 928,410 338×252 |

Series: this tablet, visual servoing, manager output — all `twist.linear.x`, all three default on,
manager output emphasised. The header states the verdict in words: *this tablet is driving* /
*visual servoing is driving* / *nothing is commanding*. The verdict reads each source's whole twist,
not only the plotted `linear.x`, so an operator driving only Z or a rotation still counts.

## What moved to Bloom Debug

`feedback-joints` (`/joint_states`), `feedback-manipulability` (`/ee_jac`) and, on kinova, the
fault echo's raw view. They are per-joint and per-matrix views: read while diagnosing, not while
operating, and they are what pushed the screen over its budget.

They still appear in the Robot feedback picker, greyed, labelled *moved to Bloom Debug*, and inert.
A diagnostic that vanishes silently is worse than one that says where it went — an engineer who
cannot find the joint states assumes the screen is broken.

`/ee_jac` is added to `allowed_recording_topics` so Debug can subscribe.

## Open

Only `linear.x` is plotted on Sources. A field picker per series is the obvious next step; six axes
at once is not readable, so the default needs to be one worth defending rather than a shrug.

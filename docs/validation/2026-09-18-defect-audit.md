# Defect audit — 2026-09-18

What four parallel audits found in the seams the suites do not reach, what was fixed, and what the fixes
were verified against. The release hardening pass earlier the same day is at
[2026-09-18-release-hardening.md](2026-09-18-release-hardening.md); this went after a different class of
problem.

## What was audited

Four passes, each reproducing every finding before reporting it, none of them editing the repository:

| Pass | Looked at | Confirmed |
| --- | --- | --- |
| Backend concurrency and lifecycle | the STOP latch, the control lease, socket teardown, rclpy handles, telemetry serialization | 7 |
| Storage, configuration and API input | migrations, malformed bundles, allowlist bypasses, the CLI | 6 |
| Runtime state machines | connection loss, ownership, teleop composition, switch scanning, dwell, unmount | 4 |
| Widgets and builder geometry | hostile settings, numeric edges, what the screen claims | 11 |

Twenty-eight defects, of which twenty-four were fixed here. Each fix landed as its own commit with a test
that fails without it.

## What the audits found sound

Worth recording, because a negative result is evidence too:

- **Session manager locking.** An eight-thread stress of interleaved connect, claim, teleop, release, STOP
  and disconnect produced no two-owner break and no leaked entries. The lease fields cannot diverge.
- **No asyncio state is mutated from an rclpy thread.** The only crossing is `call_soon_threadsafe`.
- **No lock-ordering cycle**, and STOP is never blocked by the operation lock.
- **Migrations are transactional and resume cleanly**, and old stores upgrade losslessly.
- **Allowlist bypasses are refused**: case, trailing slash, whitespace, dot segments, Cyrillic lookalikes,
  NUL, zero-width space, globs.
- **STOP is genuinely exempt from the HTTP rate limit.**
- **NaN and Inf serialization holds**, including through the shapes the guard does not name explicitly.
- **Rate-limit and audit structures are bounded.**

## The fixes that matter most

- **A refused teleop command left its value in the composed twist**, so it rode on every later command
  from the widgets that were allowed.
- **A pad authored at the maximum dead zone was live in its corners**, because the dead zone was compared
  against a square area's magnitude rather than the pad's.
- **Switch scanning could show two lit controls** and fire the one the operator was not looking at.
- **A gauge with no topic drew its authored number as a reading.** Three of them ship on the user-test app.
- **Capture would save a pose from a stream that had stopped.**
- **A socket's rclpy subscriptions leaked for the life of the process** when the lease moved on mid-release.
- **A failed `config publish` made the next API start overwrite the operator's app.**

## What this was verified against

- Backend 455, dashboard 557, renderers 143, widgets 159, api-client 20, ui 10.
- `npm run check`, `npm run build`, `npm run check:contracts`, `npm run qa:review`.
- `npm run visual:smoke`, which includes the 165-visit sweep: no new problem, the recorded known gaps
  unchanged.
- `npm run e2e:sim -- --robot explorer` and `--robot kinova`, both **12 of 12** after the changes, against
  a live Gazebo Explorer and Kinova on mock hardware. Explorer moved `/ee_pose` 14.9 cm and released to
  zero; Kinova 11.9 cm.

## What it does not prove

This is the same simulation, fixture and contract evidence as everything before it. No arm was attached.
The defects that needed hardware to find are not the ones this audit was looking for, and the ones it
fixed are still only confirmed at that level. Hardware acceptance remains open in
[extender-petanque-validation.md](../extender-petanque-validation.md) and on the
[bench card](../bench-card.md).

Four findings were left unfixed by decision, all recorded in the changelog's known limitations or here:
a store written by a newer Bloom still reports a raw validation error rather than a version message, and
three latent geometry cases that need a `NaN` layout the builder cannot currently produce.

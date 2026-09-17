# Implementation plan — design handoff 2026-09-17

Plan for turning the 17 Sep 2026 design handoff into shipped Bloom UI. It is written against `main` at `d73bfff`, after
the release-review fixes. The sources are `docs/design/` (specs, ADRs, seeds), the six prototypes in
`design_handoff_bloom_ui_implementation/prototypes/` (rendered and read section by section), and a survey of the
current frontend, backend, seeds, tests and scripts.

The screen specs in `docs/design/screens/` are the geometry source of truth. When a prototype, `DELTAS.md` or a seed
disagrees with a spec, the spec wins (handoff README).

## 1. What the handoff asks for, in one paragraph

A geometry contract (a minimum size per widget kind; cards grow instead of clipping), STOP as runtime chrome in a
seed-declared reserved region, Drive split into Bench and Operator layouts chosen by the profile, a redesigned kiosk bar,
maintenance sheet and settings, three new diagnostic widget kinds (plot board, plot picker, value strip), a list-based
runtime library that launches into a role, a desktop Bloom Debug, builder support for all of it, a new landing page, and
the design folder tracked next to the code.

## 2. Conflicts found while reading — must be resolved before or during the work

### 2.1 Safety regressions in the design seeds (resolve by keeping current behaviour)

The design seeds were generated from a ref that predates this morning's fixes:

| item | design seed | current, correct | action |
| --- | --- | --- | --- |
| Kinova gripper payloads | `[1.1]` / `[0.2]` (Explorer's) | `[0.8]` / `[0.0]` (Robotiq 85 range, fc577ed) | keep current |
| Kinova `positions-home` | present | removed; home target is Explorer's pose (cartesian_manager#10) | keep removed; the spec's Kinova Positions keeps an empty slot |

### 2.2 Spec vs seed disagreements (resolve by following the spec)

| item | seed | spec / contract | action |
| --- | --- | --- | --- |
| Joystick Lab pads, `lab-z`, `lab-rz` | `show_details: true` | "show_details comes off the pads"; with details on, all four break their own minimum | details off |
| `lab-sent` | 338×216 with details on | topic-echo minimum with details on is 280×280 | details off; the raw twist with its actions lives in Bloom Debug (§8.2) |
| `lab-gripper` | toggle 384×114 | toggle minimum 200×120; spec says "title beside the button", a layout the table does not derive | the two-column toggle card, minimum 88 tall (§8.2) |
| `bench-fault-label` (Kinova) | absent | spec lists it at 902,14 364×24 | add it, as the spec says |
| label minimum | seeds and `widget-min-size.md` table use 24 | the constant and design-system §07 say 28 | use 24 (every shipped label is 24; the text in both docs explains 24) and fix the constant |
| Positions rail | seed 928 | `DELTAS.md` says 804 | `DELTAS.md` is stale from an earlier pass; regenerate it from the final seeds |
| Kinova fault echo | dropped from Drive, placed nowhere | README: "moves to Robot feedback"; diagnostics spec: "moves to Bloom Debug" | Bloom Debug (§8.1) |

### 2.3 Repository conflicts

- **ADR numbers.** `docs/decisions/0131-observer-role.md` was added today. The handoff's ADRs become **0132 widget
  minimum size** and **0133 profile-selected control layout**, moved into `docs/decisions/`, with the references in the
  design docs updated.
- **Toggle label semantics.** Today a toggle shows the label of its *current* state, and
  `test_robot_seed_contracts.py` enforces `onLabel "Closed"` / `offLabel "Open"`. The design shows the *action* on the
  button ("Close gripper") and the state in the header ("commanded: open"). The renderer gains explicit state words
  (`onStateLabel` / `offStateLabel`), the labels become verbs, and the contract test is rewritten to the new rule: the
  button names what pressing does, the header names what was last commanded.
- **Tests and scripts that pin today's screens.** `test_config_seed.py` requires `manager_drive`. The Joystick Lab
  scanning test expects 27 buttons, including "Gripper: Open". `visual-smoke`, `capture-readme-screenshots`,
  `record-explorer-demo` and `ros-e2e-capture` navigate by the screen titles "Robot feedback", "Command sources" and
  "Joystick lab". All are updated in the same commit as the seed change.
- **Closed enums.** The backend `WidgetKind` enum, `tests/fixtures/widget-kinds-contract.json` and `WIDGET_KINDS` must all
  gain `plot-board`, `plot-picker` and `value-strip`. `ScreenConfig` forbids extra fields, so the design seeds do not
  load today.
- **Paths named in the handoff that do not exist.** There is no `frontend/apps/bloom-runtime` or
  `frontend/apps/bloom-builder`; both live in `frontend/apps/bloom-dashboard`.

### 2.4 A safety question in the prototypes

In the maintenance sheet prototype (6b), the scrim covers and dims STOP. The robot is held at zeros while the sheet is
open, but STOP should stay reachable everywhere it can command an arm. STOP stays above the scrim and live, and
the backend path is audited in Phase 3 (§8.3).

## 3. Principles for the work

- **Geometry comes from data, not CSS guesses.** Every number in the specs is either in a seed or in one shared
  constant (`WIDGET_MIN_SIZE`, the pad recipe, the bench-rail constants), and tests read those same sources.
- **Warn, never block** for undersized widgets (ADR 0132). Hard failures are kept for safety invariants.
- **Tokens only.** No feature file names a hex. The three standing violations (`#4a9eff`, `#e0685f`, `#7fa95f`) and the
  undefined CSS variables (`--bloom-pollen`, `--bloom-ink-muted`, `--bloom-font-body`) go away.
- **Roles never change what is published** (ADR 0133 rule 4). This is enforced by a test, not by review.
- **One commit per coherent change**, with tests, pushed to `main` as before. Seeds, renderers and the tests pinning
  them change together, so `main` stays green.

## 4. Phases

Each phase lists what it delivers, the main files, and its exit check. The order follows dependencies: the contract and
data model first, then the renderers the seeds need, then the chrome, then screens, then the builder and the product
pages.

### Phase 0 — Track the design folder

- Commit `docs/design/` as delivered, plus this plan. Move `prototypes/` to `docs/design/prototypes/` so the references
  live with the specs, and delete the duplicate `design_handoff_bloom_ui_implementation/` folder.
- Move the ADRs to `docs/decisions/0132-…` and `0133-…`, and fix the references in `README.md`, `widget-min-size.md`,
  `drive.md` and the review log.
- Add `docs/design/captures/`, the traceability folder design-system §15 names. It holds reference captures of every
  prototype artboard, rendered by a script (Phase 1) so they can be regenerated.
- Exclude `docs/design/prototypes/` and `design-system.html` from Biome.

**Exit:** `git status` clean; `npm run check` passes; no two ADRs share a number.

### Phase 1 — The contract and the data model

1. **`frontend/libs/widgets/src/min-size.ts`:** `WIDGET_MIN_SIZE` and `minSizeFor(kind, settings)`, adding `plot-board`
   480×280, `plot-picker` 260×200 and `value-strip` 440×140, with the label minimum set to 24 (§2.2). Unit tests
   pin every row against `widget-min-size.md`.
2. **Backend `ScreenConfig.reserved_regions`:** a list of `{id, owner: "runtime-chrome", x, y, width, height}`. Region
   ids are unique, a region lies inside the body, and no widget overlaps a region. The TS type and the frontend normalizer
   keep the field instead of dropping it. Round-trips through both stores (the SQLite normalized rows too).
3. **New kinds** `plot-board`, `plot-picker`, `value-strip` in the enum, the fixture, `WIDGET_KINDS`, the definitions,
   and settings contracts shaped as in `screens/diagnostics.md`. Placeholder renderers follow in Phase 2.
4. **Tokens** in `theme.ts` and `styles.css`:
   - the series ramp `--bloom-series-1 … -8`, with clay available as series-3
   - radii: control 14, card 18, pad 22, panel 26
   - spacing: artboard 14, region gap 12, card gap 12, in-card gap 8
   - the runtime type scale: screen title 22/700, widget title 19/700/1.25, direction word 17/700, readout 16 mono,
     group label 12/0.14em uppercase
   - density: 40 / 48 / 56 / 64
   - define the three undefined variables
   - fix `--bloom-color-muted`, which disagrees between the TS and CSS copies
   - fix the `:root` alias variables that stay Bloom sage under other theme presets
5. **Pad recipe** as a pure function `padGeometry(S)` returning inset, label width, gap, ring, dead zone, knob and
   travel. Unit tests pin the three rows of `pad-recipe.md`.
6. **Prototype capture script** `scripts/capture-design-references.mjs`. It serves `docs/design/prototypes`, renders each
   section, and writes cropped artboard images to `docs/design/captures/`.

**Exit:** the design seeds (with the §2 corrections) load through the backend and frontend normalizers; the unit tests
pass.

### Phase 2 — Widget renderers to the card anatomy

The design-system §06 bands, applied through `WidgetFrame` and each renderer:

- **`WidgetFrame`:**
  - padding 16, radius 18, title band 24 at 19 px
  - detail strip 30 and topic line 18 only with `show_details`, readout band 28
  - `min-height` on the content box; `overflow: hidden` removed
  - card background from tokens
- **States (§09):**
  - idle: cream fill, hairline border
  - selected: forest fill, "last requested" wording kept for screen readers
  - held: pollen, replacing the orange momentary and green snake-hold styles
  - interlocked: 40% on the control only, plus its word
  - unsupported: dashed `#f8f4eb` / `rgba(49,73,63,.35)` treatment plus the backend reason
  - destructive: error container plus a verb, the style the `variant: "danger"` seed setting has never had
  - no container dimming anywhere
- **`hide_title`:** on command-button and toggle.
- **Command button:**
  - confirm-press armed state drawn in pollen with "Press again to move" and "arms for 5 s, then cancels itself"
  - detail caption under the label ("dispatched once — no progress is reported")
- **Toggle:**
  - header "Gripper · commanded: open", button verb (§2.3)
  - optional `layout: "inline"`, with the title beside the button, for the Lab
- **Joystick:**
  - geometry from `padGeometry`, ring in px, arrow bound with `&nbsp;`, `flex: 0 0 auto`
  - title and `x +0.00 y +0.00` readout overlaid in the card's top corners
  - knob colour from the axis tokens (sage for translation, clay for rotation), never a hex fallback
  - read the seeds' `axes` key as well as `axis_hints`, so seed colours stop falling back
- **Slider:**
  - vertical Height and horizontal Pivot drawn as the same 110 px-thick control with a rectangular sage/clay thumb,
    title overlaid, "▲ Up / ▼ Down" and "↶ Turn left / Turn right ↷" words
  - bench speed limits with a header value `0.15 m/s` and a `0.00 → 0.30 · linear` range line
- **`variant: "segments"`** on the slider: three labelled 64 px targets from `segment_labels` / `segment_values`, the
  selected one in forest, header value in m/s. Behaviour: publishes exactly the chosen value, identical to the
  continuous slider at that value.
- **Topic echo:** the "Joint target · nothing sent / No joint target has been published this session." state, and the
  "Twist · base_link" pretty twist layout.
- **Event log:** `newest_first`, rows with an age, a mono value and a right-aligned note; the empty-entries placeholder
  bug fixed.
- **Position library:** 56 px rows with the name on the left and joint values in mono on the right, the selected row
  outlined in forest, five rows visible.
- **Label:** a group-label variant (12 px uppercase, 0.14em) as the default for the new seed labels.

**Exit:** renderer unit tests for every state and band; a per-kind geometry test mounts each kind at its minimum size and
asserts nothing overflows its card (jsdom layout is limited, so the pixel check lives in the Phase 9 visual suite).

### Phase 3 — Runtime chrome

- **Kiosk bar** (§10, prototypes 1b, 1c, 3a):
  - contents: app name, screen title, status chip, frame chip (mono, outlined), publish rate `30 Hz`, spacer, role
    pill, `⋯` hold button
  - role pill: lilac for Bench, forest for Operator
  - the hold is drawn as a pollen fill on the button itself
  - while held: chip "HELD FOR MAINTENANCE" in pollen, rate reads `zeros held`
  - when stopped: chip "STOPPED" in error, rate reads `zeros held`
  - the robot name is dropped (§8.4); the gamepad and owner tags are folded into the maintenance sheet facts
- **STOP in the reserved region:**
  - drawn at the region's rect on the scaled artboard: filled error, the largest target
  - stopped: turns forest "HOLD TO RESUME" with a one-second fill; pads and sliders dim to 45% and go inert; mode,
    frame and gripper buttons stay live
  - exempt from fit-scaling below 64 px of glass
  - screens without a region keep today's bottom-right placement; a test asserts every seeded screen that can command
    an arm declares one
- **Artboard model:**
  - a 1280×720 canvas is the whole panel: 44 px bar plus a 676 px body, widget origin 14,14
  - the runtime scales the body with the bar, so at 1280×720 widgets render at 1.0, not today's ≈0.89
  - at 1024×600 the scale is 0.8 until the collapse layout is designed (still open in the handoff)
- **Maintenance sheet** (6b):
  - centred panel over a scrim with STOP kept live (§2.4)
  - title "Maintenance" and a pollen "Robot held at zeros" badge
  - six read-only facts: link, publish rate, command frame, profile with its layout id, device class, app version
  - actions: Runtime settings, Switch role (its own 1.5 s hold), Reload this app, Exit to library (destructive)
  - footer note and a "Resume operating" button
  - screen switching and the existing tools (practice tour, supervisor mirror, builder shortcuts, help) keep a place in
    the sheet as a second action group below the design's four
- **Runtime Settings** (6a):
  - opens inside the runtime with the bar showing "HELD FOR MAINTENANCE"
  - three columns: Display, Timing and Try it
  - Display: text size Normal/Large/Larger (`font_scale` becomes editable), language EN/ES/FR, sound on every press,
    input method Touch/Dwell/Scan
  - Timing: hold to activate, scan step, ignore repeats, joystick dead zone
  - irrelevant timing cards get the interlocked dashed treatment with "only for Dwell" / "only for Scan"
  - Try it: the real control behaving with the draft settings, target and font readout
  - "Save and resume" and a "Saved to" note
  - step and latch join the input-method group as "How a push moves"; the command-frame chooser leaves Settings (§8.5)
- **STOP backend audit** while maintenance is open (§8.3)
- **Profile → layout resolution** (ADR 0133):
  - `resolveInitialScreen(app, profile)` uses `preferred_control_layout_id` when it names an existing screen, otherwise
    `screens[0]`
  - used by library launch, recents, the supervisor and the workspace selection fallbacks
  - the role is shown in the bar; switching role goes through maintenance
- **Wrong device banner:** deferred with the paired desktop apps (§5).

**Exit:**
- runtime tests for the bar contents, both holds, STOP states, the sheet facts, settings persistence and layout
  resolution with every fallback
- the live `cartesian_manager` bench still passes 17/17
- STOP, maintenance and role switching verified against the dispatcher safety tests (zeros held, STOP latch unchanged)

### Phase 4 — The manager screens (seed change)

- Replace `explorer-manager.json` and `kinova-manager.json` with the design seeds plus every §2 correction, together with
  the tests and scripts that pin them.
- Regenerate `DELTAS.md` from the final files so it matches what shipped.
- The Explorer User Tests library select and the `Auto` profile go away in Phase 6, not here.

**Exit:** all seed contract tests (Phase 9 list) pass. Explorer and Kinova Drive · Bench and Drive · Operator geometry
matches `screens/drive.md` exactly. The bench rail constants hold on every bench screen.

### Phase 5 — Plot board, plot picker, value strip

- Multi-series telemetry: one subscription per series `(topic, field_path)`, shared by the board, picker and strip.
  Samples are kept per series for `history_seconds`.
- **Plot board:**
  - series coloured in ramp order, dashed after eight, `emphasis` at double stroke
  - `-30 s → now` axis, header "N series · -30 s → now" and y bounds
  - Command sources verdict header: "this tablet is driving" / "visual servoing is driving" / "nothing is commanding",
    computed from which source tracks the manager output
- **Plot picker:**
  - legend rows with swatch, name, topic · field and the live value
  - tap to toggle, per-profile persistence
  - `show_unavailable` entries greyed with "moved to Bloom Debug"
- **Value strip:** numbers in the ramp colours, label, topic and unit, as in 4a.

**Exit:** unit tests for series assignment, wrap-around, emphasis, verdict logic, picker persistence per profile, and
unavailable rows being inert; a telemetry test that a reconnect resubscribes every series once.

### Phase 6 — Runtime app library (5a)

- The `Bloom · Runtime library · READY · tablet 1280×720` bar; the library carries no STOP.
- **Left list:** 80 px rows with an accent stripe by app kind, name, "N screens · tablet + desktop" in mono, device
  badges, the Archived badge in the §09 dashed treatment.
- **Right rail:**
  - name, description, "N screens · active"
  - "Last role used is marked. Choosing is deliberate."
  - one card per profile with its tagline, "last used" on the remembered one
  - "Open as <role>" primary action
  - device note
  - apps without profiles say so instead of inventing roles
- Remove `Auto`. A stored empty preference means "no role remembered", so the first launch is an explicit choice.
- Supervisor mirror entry: a secondary action under "Open as <role>" in the rail.
- Localize the library strings in EN/ES/FR (they are hard-coded English today).

**Exit:** library tests for selection, role memory per device, the archived treatment, no-profile apps and migration of
a stored `Auto`.

### Phase 7 — Bloom Debug on desktop (5b)

- `bloom-debug.json` becomes a 1920×1080 desktop app laid out as 5b:
  - three status cards: robot preflight, topic catalog, runtime audit
  - Refresh topics / Refresh audit / Start recording
  - a 1460×520 plot board with its picker
  - joint states table: position, velocity, effort and limit proximity, coloured at 80%
  - 6×6 jacobian with the manipulability bar
  - raw echo with Pause/Copy
  - STOP at the desktop minimum 420×140
- **Needs data that is not available yet:**
  - joint limits for proximity (URDF limits are not exposed to Bloom)
  - the `/ee_jac` matrix message shape
  - if either is missing, the column shows "not reported" rather than invented numbers (invariant 04)
- Lilac is legal here and nowhere else.

**Exit:** debug tests for each card with and without data; the visual capture at 1920×1080 and 1440×900.

### Phase 8 — Builder (7a)

- **Canvas:**
  - `#2a2f2c` desk
  - the panel drawn at true proportion with the 44 px bar strip
  - reserved regions drawn as dashed error areas that refuse drops and moves
  - "TOO SMALL" pollen corner tags
  - a live `W×H · Npx glass` size chip on the selection
- **Toolbar:** a Tablet 1280×720 / Desktop 1920×1080 device-class switcher; chips for canvas, widgets, fit scale and
  mode; "N widgets below minimum".
- **Inspector:**
  - kind, position, size in error colour when undersized, "Glass at fit 0.80: 45 px"
  - the "Below minimum size" explanation with a one-tap "Resize to W×H"
  - screen widget list with TOO SMALL tags
- **Review checklist additions:**
  - minimum size
  - sibling symmetry
  - pad pairs square with a shared centre line
  - profile coverage
  - paired-app policy equality (inert until paired apps exist)
- **Checklist fixes:** glass-scaled touch floor at the real panel; `native-1280x720` and `hd` treated alike; the builder
  home preview-bounds bug fixed.

**Exit:** builder tests for tags, resize action, reserved-region refusal, glass computation and each checklist rule.

### Phase 9 — Landing (7b) and locale (7c)

- **Landing:**
  - "Bloom · ISIR" eyebrow, "Give the gesture back." headline and supporting paragraph
  - "Open Runtime" (primary), "Open Builder", "Get started"
  - hero image placeholder with its caption, marked as awaiting a photograph
  - Reach / Change / Trust cards, footer line and docs link
  - the "Architecture promises" section moves to the docs
- **Locale:**
  - the operator strings from 7c: speed words, both/hold snake, turn words, gripper verbs and state, STOP/PARADA/ARRÊT,
    hold-to-resume, maintenance wording
  - ES/FR marked as needing a native speaker before participant use
  - labels wrap to two lines and the control grows; nothing truncates

### Phase 10 — Documentation and release notes

- Update README captures, the operator guide (roles, bench rail, STOP chrome, maintenance sheet, settings), the builder
  help and the CHANGELOG (breaking: `manager_drive` split, toggle label semantics, `reserved_regions`, new kinds, the
  library `Auto` removal).
- Add a dated review entry in `docs/design/reviews/` recording what shipped and what stayed open.

## 5. Out of scope for this plan (stated so nobody assumes them)

- **Paired desktop apps** (`explorer-manager-desktop`, `kinova-manager-desktop`), `policy_id` and the wrong-device
  banner. The handoff states their geometry tables are not written; the drift guard lands with the first pair.
- **1024×600 collapse layouts** (context 88, rail 196). This is still an open design pass; until then the panel is
  fit-scaled at 0.8.
- **Desktop layouts** for Drive · Bench, Joystick Lab, Robot feedback, Command sources and the supervisor mirror.
- **Save-a-pose flow** (capture, name, confirm). The spec says it has no design yet.
- **Left-handed mirroring** of the operator layout. It is mentioned in `drive.md`, but no profile flag is specified.
- **The three operator speeds** 0.08 / 0.15 / 0.30. They ship as authored and need an operator and Mégane to confirm.

## 6. Testing plan

### 6.1 Unit (vitest, pytest)

- `minSizeFor`: every table row, both `show_details` states, grouped buttons, unknown kinds.
- `padGeometry`: the three documented pad sizes, and ring, dead zone and knob derived from `S` alone.
- Screen resolution: preferred id present, empty, unknown; supervisor and recents use the same rule.
- Series colouring: assignment in order, wrap past eight with a dashed stroke, emphasis weight.
- Segmented slider: renders three targets, publishes exactly the chosen value, keyboard and scan reachable.
- Toggle: button shows the verb for the next action, header shows the commanded state, payloads unchanged.
- States: selected, held, interlocked, unsupported and destructive render their treatment and their word; no container
  gets `opacity` (asserted on computed style).
- Kiosk bar: exactly the specified slots, rate text, chip precedence (STOPPED > HELD > LINK DOWN > READY).
- STOP: engage on press, resume on a 1 s hold only for the owner; pads inert and dimmed while mode/frame stay live.
- Maintenance sheet: opens after 1.5 s only, zeros held while open, facts rendered, switch role needs its own hold,
  STOP still reachable.
- Settings: `font_scale` editable, irrelevant timing cards interlocked with a reason, try-it preview obeys the draft,
  save persists per profile.
- Plot picker persistence per profile; unavailable rows inert; verdict logic for Command sources.
- Library: role memory per device, no auto-launch, archived treatment, no-profile apps, `Auto` migration.
- Builder: undersize tag and one-tap resize, glass size per screen, reserved region refuses placement, each checklist
  rule.

### 6.2 Seed and contract tests (backend pytest, `npm run check:contracts`)

- Every seed loads with `reserved_regions` and the new kinds, through both stores.
- **Minimum size:** zero warnings on every screen of `explorer-manager`, `kinova-manager` and `bloom-debug`. Other seeds
  report warnings without failing (ADR 0132).
- **Spec parity:** a script parses the geometry tables in `docs/design/screens/*.md` and asserts each seed widget has
  exactly that layout. This makes "spec is source of truth" a build failure instead of a review note.
- **Bench rail:** stage 14–916, rail 928–1266, STOP 928,410 338×252 on every tablet bench screen.
- **STOP presence:** every screen with a publishing or teleop widget declares a `stop` region; no widget overlaps a
  region; every widget lies inside the 1266×662 body.
- **Sibling symmetry:** widgets of one kind on one row share a size; pad pairs are square with an equal centre y.
- **Profile coverage:** every profile's `preferred_control_layout_id` resolves to a screen.
- **Role invariance:** for every widget id present in both `manager_drive_bench` and `manager_drive_operator`, the
  published topic, message type, payloads, runtime binding, dead zone and publish rate are identical. Only layout and
  presentation keys (`show_details`, `hide_title`, `variant`, segment settings, titles, labels) may differ.
- **Safety invariants kept:** Kinova gripper within 0.0–0.8; no Kinova joint-target request; gripper "on" commands the
  more-closed position; teleop on `/joystick_cartesian_command` is TwistStamped.
- **No non-token colours in seeds:** `#4a9eff`, `#e0685f` and `#7fa95f` never appear.
- The frontend/backend coherence check still passes, and `/ee_jac` is allowed for recording where the picker lists it.

### 6.3 Visual verification (Playwright)

- **Reference captures.** `scripts/capture-design-references.mjs` renders every prototype artboard into
  `docs/design/captures/`.
- **Implementation captures.** The visual smoke run captures the same screens from the running dashboard with mocked
  API data matching the prototypes' static values (zeroed readouts, the same pose names, READY link). Resolutions:
  1280×720 for tablet screens, 1920×1080 for Bloom Debug and the builder, 1440 wide for the landing page.
- **Geometry assertions (the gate).** Measured from the live DOM:
  - every widget card's rect equals its seed layout at the resolved scale, within 1 px
  - STOP equals its region; the bar is 44 px
  - pad bodies equal `padGeometry(S)`, with ring, dead zone and knob in px
  - text is not clipped in any card
  - computed font families are Atkinson Hyperlegible and JetBrains Mono
  - computed colours of states and axes equal the tokens
- **Pixel comparison (the report).** Each implementation capture is diffed against its reference with a small tolerance
  and published side by side for review. Differences in live content (plot traces, timestamps) are masked. The pixel
  diff produces a report, not a CI gate, because fonts render slightly differently across machines. The DOM
  assertions above are the gate.
- **Viewports:** 1280×720 and 1024×600 for every tablet screen (at 1024×600: fit 0.8, nothing below 44 px of glass,
  operator targets at least 64 × 0.8, no horizontal overflow); 1920×1080 and 1440×900 for Bloom Debug.
- **Locales:** EN, ES, FR and pseudo-locale on the operator Drive, bar, STOP, maintenance sheet and settings. Nothing
  truncates; controls may grow within their card.

### 6.4 Accessibility

- Contrast of every new token pair and state treatment with the existing contrast test (≥ 4.5:1 text, ≥ 3:1 controls),
  including the dashed unsupported treatment (5.37:1) and the pollen held state.
- Keyboard: every control reachable, STOP engage on Enter/Space, the 1.5 s and 1 s holds usable by keyboard.
- Scan and dwell: scanning order on both Drive layouts and the settings screen; segment targets reachable; STOP never
  skipped.
- Screen readers: roles, pressed and selected states, and the "requested, never confirmed" wording kept in accessible
  names.

### 6.5 Robot-facing verification

- The live `cartesian_manager` bench (17 checks) after Phases 3, 4 and 5: teleop, release, timeout, unknown frame, STOP
  zero and passthrough, refusal while stopped, owner resume, disconnect neutralization.
- One added bench check: the same gesture on Drive · Bench and Drive · Operator publishes identical messages on
  `/joystick_cartesian_command` and `/mode_request`.
- The ROS e2e capture script re-run for both Drive layouts, Joystick Lab, Positions, Robot feedback and Command sources.

### 6.6 CI

- `check:contracts` gains the spec-parity, bench-rail, STOP-presence, min-size, symmetry, profile-coverage and
  role-invariance checks (backend tests cover what is data; the parity script covers the markdown tables).
- `visual:smoke` gains the DOM geometry assertions above for the new screens, and uploads the side-by-side report on
  failure.
- `npm run verify` stays the local mirror of CI.

## 7. Commit sequence

1. docs(design): track the design handoff and its prototypes, renumber its ADRs
2. feat(widgets): add the widget minimum-size contract and the pad recipe
3. feat(config): let screens reserve regions for runtime chrome
4. feat(widgets): add the plot-board, plot-picker and value-strip kinds
5. feat(ui): add the series ramp, radii, spacing and runtime type tokens
6. feat(widgets): render cards to the design anatomy and states
7. feat(widgets): segmented slider, verb toggles, grouped buttons, pad recipe joysticks
8. feat(runtime): draw STOP in its reserved region and scale the full panel
9. feat(runtime): rebuild the kiosk bar and the maintenance sheet
10. feat(runtime): rebuild runtime settings
11. feat(runtime): open the layout the profile names
12. feat(apps): split Drive into Bench and Operator and bring the manager screens to spec
13. feat(widgets): plot board, picker and value strip with multi-series telemetry
14. feat(runtime): launch apps into a role from a list library
15. feat(apps): Bloom Debug on desktop
16. feat(builder): minimum sizes, glass, reserved regions and the device switcher
17. feat(dashboard): the new landing page and operator locale strings
18. docs: captures, operator guide, changelog and the review entry

Each commit carries its tests. Commits 12 and 13 run the live bench before pushing.

## 8. Decisions recorded on 2026-09-17

1. **Kinova fault echo** moves to **Bloom Debug**, not Robot feedback.
2. **Joystick Lab stays simple; Bloom Debug takes the detail.** `lab-sent` and every Lab control run with
   `show_details: false`. The gripper uses the design's two-column card (title and commanded state left, verb button
   right), whose minimum is derived like a grouped button: `32 + 56 = 88` tall. Axis maps, topics, dead zones, the raw
   twist with its actions, joint states, the jacobian and the Kinova fault state are Bloom Debug's to show in full.
3. **STOP stays live above the maintenance scrim.** Phase 3 includes an audit of the backend STOP path while maintenance
   is open: engaging STOP must still latch and publish zeros and passthrough; the sheet's "held at zeros" must be true at
   the backend, not only in the browser; resume must still require ownership.
4. **Robot name is dropped from the kiosk bar.** It stays on the supervisor mirror.
5. **Settings coverage, placed by the design's own rule** ("a settings screen an operator can reach must not be able to
   change what the app sends"):
   - Step and latch presets join Touch, Dwell and Scan under **How you reach the controls**, as a second card, **How a
     push moves**, with Drag / Tap by tap / Keep going.
   - The command frame leaves Settings. It changes what is published, so it is chosen on the Joystick Lab frame row
     (bench) and shown read-only in the bar and the maintenance sheet. The per-profile frame override stops being
     writable; a stored one is ignored and removed.
6. **Scope** stays as §5. After this plan ships, the out-of-scope items are revisited and the implementation reviewed.

## 9. Found while implementing

- **Order.** Layout resolution (commit 11) and the plot kinds (13) landed before the seed change (12), so the new seeds
  load and open in their role. STOP in its reserved region (part of 8) ships with 12: the corner STOP would cover the
  operator Pivot at 1024×600.
- **Kinova Drive · Bench fault reset.** The spec's `590,548 326×114` overlaps Pivot at `532,548`. It takes the free slot
  under Translation, `136,548 384×114`, titled, so `bench-fault-label` is not needed.
- **Pivot sign.** Height reads up as `+linear_z` and Translation reads forward/right as `+linear_y`/`+linear_x`, so z is
  up and `+angular_z` turns left. The horizontal Pivot sends `scale: -1` so its left end turns left, on Drive and the
  Lab alike. Verify on the bench.
- **Kinova segments.** Explorer's 0.08 / 0.15 / 0.30 exceed Kinova's 0.1 m/s; Kinova uses 0.025 / 0.05 / 0.10.
- **Positions keeps capture.** The design shows a pick-only list because no save flow is designed, but the library can
  already capture and export. It stays editable until the save flow exists; `editable: false` gives the pick-only list.

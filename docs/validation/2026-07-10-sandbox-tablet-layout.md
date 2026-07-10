# 2026-07-10 - Sandbox V0.0 Tablet Layout

Status: accepted for browser-tablet layout at `1024x600`.

Validator: Codex.

## Scope

This record covers the Sandbox V0.0 runtime tablet layout after the runtime
status strip, enlarged `snake_control` controls, and HD-bounded
`control_panel` grouping changes.

This is a browser-layout validation at `1024x600`; it does not replace a final
touch pass on the physical HMTECH tablet.

## Command

```bash
npm run validation:sandbox-tablet
```

Result: passed.

Screenshots were captured in:

```text
/tmp/bloom-sandbox-tablet-layout
```

## Contract Covered

The validation command checks the runtime app at `1024x600` and verifies:

- `Control Panel`, `Snake Control`, and `Visual Servoing Monitor` open from the
  Sandbox V0.0 runtime screen tabs;
- widget frames stay inside the runtime viewport;
- widget frames do not overlap;
- the Control Panel Z slider track remains visibly usable;
- Control Panel joysticks remain visible as compact controls;
- Snake hold and B1/B2 controls remain large enough after HD canvas scaling;
- Snake joystick remains large enough for the dedicated Snake Control screen;
- visual-servoing monitor plots stay visible.

## Fix Captured

The first validation pass caught that the Snake hold and B1/B2 segmented
controls were too small after HD-to-tablet scaling. The `snake-hold` and
`mode-segmented` runtime variants now use larger source dimensions so their
rendered tablet boxes remain usable.

## Remaining Acceptance

Physical tablet validation still needs:

- touch accuracy on the configured HMTECH display mapping;
- operator confirmation that the enlarged Snake controls feel comfortable;
- confirmation that browser chrome, OS scaling, and the lab display mode do not
  reduce the usable touch area below the browser validation envelope.

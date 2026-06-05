# 2026-06-05 UX Review And Fixes

## Scope

This review focused on the current Bloom frontend from a tablet-first robotics operator perspective:

- Landing page.
- Builder home.
- App configuration.
- Runtime app view.
- Visual smoke coverage for `1024x600`, `1280x800`, and `1920x1080`.

## UX Findings

### 1. Builder Home Was Beautiful But Too Tall On Tablet

At `1024x600`, the first builder screen showed the product hero and only the top of the action cards. The page looked good, but the user had to scroll before understanding the available builder paths.

Fix:

- Compact the builder hero at tablet sizes.
- Keep the builder section switcher visible and horizontally resilient.
- Show the three main builder choices in the first viewport.

### 2. App Configuration Was Not In Visual Smoke Coverage

The app configuration page is one of the most important builder screens, but visual smoke only covered landing, builder home, and runtime.

Fix:

- Add `app-config` to the visual smoke routes.
- This caught a real scroll-position bug immediately.

### 3. Route Changes Preserved Old Scroll Position

Opening app configuration from the builder could keep the previous page scroll position, causing the title and primary context to be cut off.

Fix:

- Reset viewport scroll and focus the main content region when product route state changes.
- This preserves browser history while keeping standard page-entry affordances.

### 4. Runtime Reserved Empty Layout Space

The runtime workspace always reserved a debug row in its CSS grid, even when Bloom Debug was not rendered. This reduced useful operator canvas space on tablet.

Fix:

- Add `data-has-debug` to the runtime workspace.
- Use a two-row layout for regular runtime apps and a three-row layout only for Bloom Debug.

### 5. Runtime Operator View Needed More Useful Space

On `1024x600`, the runtime app was functional but too compressed for comfortable joystick/slider interaction.

Fix:

- Compact runtime chrome for low-height tablet viewports.
- Hide secondary labels in constrained runtime mode.
- Reduce runtime canvas padding and recover space for controls.

## Validation

Commands run:

```bash
npm run check
npm run visual:smoke
```

Visual smoke now captures:

- `landing`
- `builder`
- `app-config`
- `runtime`

Each route is captured at:

- `1024x600`
- `1280x800`
- `1920x1080`

## Remaining UX Watchlist

- App configuration is readable, but still dense. A future wizard mode should guide non-web users through identity, theme, screens, and runtime policy in a safer order.
- Builder overview cards are now understandable in the first tablet viewport, but the best long-term direction is stronger task-based onboarding.
- Runtime joysticks/sliders now have enough room in the smoke fixture, but real tablet validation should continue on the HMTECH touch display.
- Advanced builder sections should progressively disclose details so Bloom stays operator-friendly and not log-console-shaped.

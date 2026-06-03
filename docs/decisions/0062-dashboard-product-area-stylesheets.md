# 0062 - Split Dashboard Styles By Product Area

## Status

Accepted.

## Context

The dashboard stylesheet had grown into a single large file mixing global shell
styles, builder styles, runtime app styles, widget runtime styles, and
responsive rules. That made small UI fixes harder to review and increased the
risk of accidental visual regressions.

## Decision

Keep the base landing/dashboard shell styles in `App.css`, and split product
areas into focused stylesheets:

- `builder.css` for builder home, app configuration, screen builder, inspector,
  palette, and WYSIWYG canvas chrome;
- `runtime-app.css` for the app runtime shell and screen tabs;
- `runtime-widgets.css` for rendered widget primitives;
- `responsive.css` for viewport overrides, imported last.

## Consequences

- UI foundation work can evolve by product area instead of editing a monolithic
  stylesheet.
- Responsive overrides remain centralized and ordered after base product styles.
- The next design-system extraction can promote repeated patterns from these
  files into `frontend/libs/ui` more safely.

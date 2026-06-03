# 0068 - Profile-Ready Application Model

Status: accepted.

## Context

The partner interface review showed several useful layout contexts such as
default, home, meal, and work. For Extender, this maps naturally to reusable
screens and apps, but it also points to a future personalization layer:

- user profile;
- display preset;
- font scale;
- app theme;
- preferred control layout;
- motor-accessibility preset.

This should not block the current app/screen migration, but the storage model
should not make profiles hard to add later.

## Decision

Add a lightweight `profiles` collection to `ApplicationConfig`.

Each profile stores:

- `id` and `name`;
- `display_preset`;
- `font_scale`;
- `app_theme_preset_id`;
- `preferred_control_layout_id`;
- `motor_accessibility_preset`.

Existing configurations remain compatible because profiles default to an empty
list. The frontend normalizer also fills missing profiles for older JSON.

## Consequences

- Bloom can later add profile selection, display presets, and accessibility
  personalization without changing the top-level app model.
- SQLite storage can normalize profiles into a dedicated table when the broader
  app/screen/theme schema is stabilized.
- Profile behavior remains app-level and generic; Extender-specific layout names
  or motor-accessibility workflows should be stored as app configuration, not as
  hard-coded renderer behavior.

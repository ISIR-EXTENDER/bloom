# Runtime Language Validation

Date: 2026-09-16

Repository, browser, and ROS-bench validation of the English, Spanish, and French runtime shell. This is not a
native-speaker review, physical-tablet acceptance, or validation of translated safety wording with operators.

## Contract

- `UserProfile.language` accepts `en`, `es`, or `fr` and defaults to English.
- Maintenance and Runtime Settings update the selected profile through the existing local override payload.
- Status, STOP/resume, kiosk, Maintenance, scanning, Settings, and empty-screen copy use the selected catalog.
- Authored application, screen, and widget labels remain configuration data.
- Numbers, topic names, frame IDs, and axis values are not translated.
- Unsupported stored locale values fall back to English.

## Visual Evidence

`npm run visual:smoke` completed its existing route and viewport matrix and added four `1280x720` Settings captures:
English, Spanish, French, and a 40%-expanded pseudo-localized pass. The first pass exposed Spanish and pseudo-locale
preview controls extending beyond their container. The preview was changed to bounded responsive grid tracks, long
labels can wrap, and the smoke script now checks each button and output against the preview container bounds. The
second full pass completed without document overflow or clipped preview controls.

## Live ROS Evidence

The existing ROS-enabled API and dashboard produced fresh Explorer Manager captures without mocks:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs \
  --only 03-runtime-maintenance,06-settings-language,08-runtime-french \
  --out /tmp/bloom-lot2-live
```

The live French runtime reported `PRÊT` and rendered `ARRÊT`; the Explorer screen and widget labels stayed in their
authored English. Maintenance kept the language selector outside the operating chrome, and Settings rendered all three
full language names without overlap.

## Automated Evidence

- Catalog tests compare the complete key tree for EN/ES/FR, assert unsupported-locale fallback, and require at least
  35% pseudo-locale expansion.
- Runtime tests cover localized status, localized STOP/resume, immediate Settings switching, and persisted language
  overrides.
- Backend model tests cover the English default and an explicit French profile.
- The TypeScript/production build, Biome, 570 frontend tests across all workspaces, and 314 backend tests pass. Biome
  retains the two pre-existing warnings for the scanning outline's `!important` and unused imports in the untouched
  gamepad test.

## Still Required

- Review French and Spanish stop, resume, fault, and recovery wording with native speakers and operators before
  participant use.
- Decide whether authored labels need a per-locale configuration schema and fallback chain; this lot deliberately does
  not translate authored data in code.
- Validate wrapping, reach, switch timing, dwell timing, and audio cues on the intended tablets and assistive devices.

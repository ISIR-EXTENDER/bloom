# 0058 - App Theme Inspiration

## Status

Accepted.

## Context

Bloom apps should be visually configurable per app. The default Bloom identity is calm, light, and garden-inspired, but
apps such as Petanque may intentionally use a brighter or more playful visual direction.

Users may not want to tune every color manually. A practical builder should let them attach design inspiration, such as a
moodboard image or website reference, then later generate or refine a coherent app design system from that input.

## Decision

Add app theme inspiration metadata to `ApplicationTheme`:

- `moodboard_image_uri` stores an image reference for the app's moodboard;
- `reference_url` stores a website or visual reference URL;
- applied palette tokens remain separate from inspiration metadata.

The current dashboard may store small uploaded raster moodboards as data URLs for early local testing. This is a
temporary builder foundation. Once SQLite storage is normalized further, Bloom should add a backend asset upload endpoint
and store asset references instead of large inline data URLs.

The reference URL is stored only as metadata for now. Bloom does not fetch or analyze arbitrary websites yet.

## Consequences

- App-specific design direction can be saved before automatic theme generation exists.
- The builder keeps a clear boundary between "what inspired this app" and "what tokens are applied now".
- Future theme generation can use moodboards, website references, palette presets, and manual edits without changing
  widget contracts.
- Security and storage concerns stay visible: external URL analysis and asset upload must be implemented deliberately.

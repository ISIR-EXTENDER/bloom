import { type BloomThemePreset, BloomThemeProvider } from "@bloom/ui";

/** A palette drawn in its own tokens: the parts an operator must find at a glance. Decorative; the button names it. */
export function PalettePreview({ preset }: { preset: BloomThemePreset }) {
  return (
    <BloomThemeProvider as="span" className="bloom-palette-preview" theme={preset}>
      <span aria-hidden="true" className="bloom-palette-preview-surface">
        <span className="bloom-palette-preview-primary">Go</span>
        <span className="bloom-palette-preview-focus">Aa</span>
        <span className="bloom-palette-preview-stop">STOP</span>
        <span className="bloom-palette-preview-unavailable" />
        <span className="bloom-palette-preview-unknown" />
        <span className="bloom-palette-preview-ready">
          <span className="bloom-palette-preview-dot" />
          Ready
        </span>
      </span>
    </BloomThemeProvider>
  );
}

/** Four chips in the palette's own colours, for a compact choice. */
export function PaletteSwatch({ preset }: { preset: BloomThemePreset }) {
  const { tokens } = preset;
  return (
    <span aria-hidden="true" className="bloom-palette-swatch">
      {(["surface", "primary", "success", "stop"] as const).map((role) => (
        <span key={role} style={{ background: tokens[role] }} />
      ))}
    </span>
  );
}

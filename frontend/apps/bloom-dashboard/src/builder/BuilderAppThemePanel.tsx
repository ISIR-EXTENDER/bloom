import type { ApplicationConfig } from "@bloom/api-client";
import { APP_THEME_PRESETS, type ThemeInspiration } from "./app-config-model";

// The inspiration props stay for the data model; nothing reads a moodboard or reference yet, so the panel hides them.
type BuilderAppThemePanelProps = {
  inspirationError: string;
  onInspirationChange: (patch: Partial<ThemeInspiration>) => void;
  onMoodboardFile: (file: File | undefined) => void;
  onThemeChange: (theme: ApplicationConfig["theme"]) => void;
  theme: ApplicationConfig["theme"];
};

export function BuilderAppThemePanel({ onThemeChange, theme }: BuilderAppThemePanelProps) {
  const palettePreview = Object.entries(theme.palette);

  return (
    <section className="builder-config-panel" aria-labelledby="builder-theme-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Design system</p>
          <h2 id="builder-theme-title">App theme</h2>
        </div>
      </div>
      <p className="builder-inspector-copy">The preset sets the colours of the running app.</p>
      <div className="builder-theme-presets">
        {APP_THEME_PRESETS.map((preset) => (
          <button
            aria-pressed={theme.preset_id === preset.id}
            key={preset.id}
            onClick={() => onThemeChange({ ...theme, palette: preset.palette, preset_id: preset.id })}
            type="button"
          >
            <span>{preset.label}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
      <fieldset className="builder-theme-swatches">
        <legend>App card colours</legend>
        <p className="builder-inspector-copy">
          Builder Home shows the primary colour as this app's card stripe. The running app takes its colours from the
          preset above.
        </p>
        <div className="builder-theme-preview">
          {palettePreview.map(([key, value]) => (
            <span key={key} style={{ background: value }} title={key} />
          ))}
        </div>
        {palettePreview.map(([key, value]) => (
          <label className="builder-theme-swatch" key={key}>
            <span>{key}</span>
            <input
              aria-label={`${key} color`}
              onChange={(event) =>
                onThemeChange({ ...theme, palette: { ...theme.palette, [key]: event.target.value } })
              }
              type="color"
              value={value}
            />
          </label>
        ))}
      </fieldset>
    </section>
  );
}

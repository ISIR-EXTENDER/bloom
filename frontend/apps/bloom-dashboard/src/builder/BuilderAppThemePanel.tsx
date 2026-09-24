import type { ApplicationConfig } from "@bloom/api-client";
import { getTouchEditingProps } from "../ui/touchEditing";
import { APP_THEME_PRESETS, DEFAULT_THEME_INSPIRATION, type ThemeInspiration } from "./app-config-model";

type BuilderAppThemePanelProps = {
  inspirationError: string;
  onInspirationChange: (patch: Partial<ThemeInspiration>) => void;
  onMoodboardFile: (file: File | undefined) => void;
  onThemeChange: (theme: ApplicationConfig["theme"]) => void;
  theme: ApplicationConfig["theme"];
};

export function BuilderAppThemePanel({
  inspirationError,
  onInspirationChange,
  onMoodboardFile,
  onThemeChange,
  theme,
}: BuilderAppThemePanelProps) {
  const inspiration = theme.inspiration ?? DEFAULT_THEME_INSPIRATION;
  const palettePreview = Object.entries(theme.palette);

  return (
    <section className="builder-config-panel" aria-labelledby="builder-theme-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Design system</p>
          <h2 id="builder-theme-title">App theme</h2>
        </div>
      </div>
      <p className="builder-inspector-copy">
        Each app can carry its own coherent palette. Bloom keeps this simple for now, then future templates can generate
        richer design systems from moodboards or presets.
      </p>
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
      <div className="builder-theme-inspiration">
        <div>
          <h3>Theme inspiration</h3>
          <p className="builder-inspector-copy">
            Save a moodboard image or website reference with the app. Bloom will later use this as input for coherent
            app-specific design system generation.
          </p>
        </div>
        {inspiration.moodboard_image_uri ? (
          <img alt="Current app moodboard preview" src={inspiration.moodboard_image_uri} />
        ) : (
          <div className="builder-theme-inspiration-empty">No moodboard image yet.</div>
        )}
        <label className="builder-settings-field">
          <span>Moodboard image</span>
          <input
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              onMoodboardFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
        <label className="builder-settings-field">
          <span>Website reference</span>
          <input
            {...getTouchEditingProps("url")}
            onChange={(event) => onInspirationChange({ reference_url: event.target.value })}
            placeholder="https://example.com/inspiration"
            type="url"
            value={inspiration.reference_url}
          />
        </label>
        {inspirationError ? <p className="builder-inline-error">{inspirationError}</p> : null}
      </div>
      <fieldset className="builder-theme-swatches">
        <legend>Application palette</legend>
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

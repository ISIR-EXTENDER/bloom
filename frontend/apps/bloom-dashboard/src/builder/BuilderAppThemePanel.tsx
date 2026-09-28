import type { ApplicationConfig } from "@bloom/api-client";
import { resolveBloomThemePreset } from "@bloom/ui";
import { PalettePreview } from "../ui/PalettePreview";
import { APP_THEME_PRESETS, type ThemeInspiration, withThemePreset } from "./app-config-model";

// The inspiration props stay for the data model; nothing reads a moodboard or reference yet, so the panel hides them.
type BuilderAppThemePanelProps = {
  inspirationError: string;
  onInspirationChange: (patch: Partial<ThemeInspiration>) => void;
  onMoodboardFile: (file: File | undefined) => void;
  onThemeChange: (theme: ApplicationConfig["theme"]) => void;
  theme: ApplicationConfig["theme"];
};

export function BuilderAppThemePanel({ onThemeChange, theme }: BuilderAppThemePanelProps) {
  const selectedId = resolveBloomThemePreset(theme.preset_id).id;

  return (
    <section className="builder-config-panel" aria-labelledby="builder-theme-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Design system</p>
          <h2 id="builder-theme-title">App theme</h2>
        </div>
      </div>
      <p className="builder-inspector-copy">
        Each palette is checked for contrast, colour-blind safety and STOP prominence. It colours the running app and
        this app's Builder card; a role can pick its own under Roles, and an operator can change it in Settings.
      </p>
      <fieldset className="builder-theme-presets">
        <legend className="sr-only">App palette</legend>
        {APP_THEME_PRESETS.map((preset) => (
          <button
            aria-pressed={selectedId === preset.id}
            key={preset.id}
            onClick={() => {
              if (selectedId !== preset.id) {
                onThemeChange(withThemePreset(theme, preset.id));
              }
            }}
            type="button"
          >
            <PalettePreview preset={resolveBloomThemePreset(preset.id)} />
            <span className="builder-theme-preset-name">{preset.label}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </fieldset>
    </section>
  );
}

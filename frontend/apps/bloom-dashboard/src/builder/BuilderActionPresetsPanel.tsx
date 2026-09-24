import type { RuntimeActionPreset } from "@bloom/api-client";
import type { RosMessageCommandPreset } from "@bloom/widgets";
import { getTouchEditingProps } from "../ui/touchEditing";
import { COMMAND_PRESET_GROUPS, formatPresetCategory } from "./app-config-model";
import { countLabel } from "./builderHomeModel";

type BuilderActionPresetsPanelProps = {
  newPreset: RuntimeActionPreset;
  onAddLibraryPreset: (preset: RosMessageCommandPreset) => void;
  onAddPreset: () => void;
  onNewPresetChange: (patch: Partial<RuntimeActionPreset>) => void;
  onRemovePreset: (presetId: string) => void;
  presets: readonly RuntimeActionPreset[];
};

const PRESET_FIELDS: ReadonlyArray<{
  editing: Parameters<typeof getTouchEditingProps>[0];
  field: "command" | "message_type" | "name" | "topic";
  label: string;
  placeholder: string;
}> = [
  { editing: "name", field: "name", label: "Preset name", placeholder: "Emergency stop" },
  { editing: "text", field: "command", label: "Command", placeholder: "behaviour/joint_target/home" },
  { editing: "text", field: "topic", label: "Topic", placeholder: "/mode_request" },
  { editing: "text", field: "message_type", label: "Message type", placeholder: "std_msgs/msg/Bool" },
];

export function BuilderActionPresetsPanel({
  newPreset,
  onAddLibraryPreset,
  onAddPreset,
  onNewPresetChange,
  onRemovePreset,
  presets,
}: BuilderActionPresetsPanelProps) {
  return (
    <section className="builder-config-panel" aria-labelledby="builder-action-presets-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Commands</p>
          <h2 id="builder-action-presets-title">Reusable presets</h2>
        </div>
        <span className="builder-section-badge">{countLabel(presets.length, "preset")}</span>
      </div>
      <p className="builder-inspector-copy">
        Save common app commands once, then reference them from command widgets with their preset id.
      </p>
      <ul className="builder-action-preset-library" aria-label="Reusable command preset library">
        {COMMAND_PRESET_GROUPS.map(([category, libraryPresets]) => (
          <li key={category}>
            <h3>{formatPresetCategory(category)}</h3>
            <div className="builder-action-preset-library-grid">
              {libraryPresets.map((preset) => (
                <button
                  aria-label={`Add ${preset.label} preset from library`}
                  key={preset.id}
                  onClick={() => onAddLibraryPreset(preset)}
                  type="button"
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="builder-action-preset-list">
        {presets.length === 0 ? (
          <p className="builder-empty-state">No reusable command presets yet.</p>
        ) : (
          presets.map((preset) => (
            <article className="builder-action-preset-card" key={preset.id}>
              <div>
                <strong>{preset.name}</strong>
                <span>{preset.id}</span>
              </div>
              <small>{preset.topic || preset.command || "No runtime target configured yet."}</small>
              <button
                aria-label={`Remove ${preset.name} preset`}
                onClick={() => onRemovePreset(preset.id)}
                type="button"
              >
                Remove
              </button>
            </article>
          ))
        )}
      </div>
      <div className="builder-action-preset-form">
        {PRESET_FIELDS.map(({ editing, field, label, placeholder }) => (
          <label className="builder-settings-field" key={field}>
            <span>{label}</span>
            <input
              {...getTouchEditingProps(editing)}
              onChange={(event) => onNewPresetChange({ [field]: event.target.value })}
              placeholder={placeholder}
              type="text"
              value={newPreset[field]}
            />
          </label>
        ))}
        <label className="builder-settings-field">
          <span>Payload</span>
          <textarea
            {...getTouchEditingProps("text")}
            onChange={(event) => onNewPresetChange({ payload_text: event.target.value })}
            placeholder="{data: true}"
            rows={3}
            value={newPreset.payload_text}
          />
        </label>
        <button disabled={!newPreset.name.trim()} onClick={onAddPreset} type="button">
          Add preset
        </button>
      </div>
    </section>
  );
}

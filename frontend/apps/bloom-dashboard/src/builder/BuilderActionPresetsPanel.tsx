import type { RuntimeActionPreset } from "@bloom/api-client";
import type { RosMessageCommandPreset } from "@bloom/widgets";
import { getTouchEditingProps } from "../ui/touchEditing";
import { commandPresetGroupsFor, formatPresetCategory } from "./app-config-model";
import { countLabel } from "./builderHomeModel";
import { describePresetTypeProblem, SERVICE_CALL_KIND } from "./widget-send-problems";

type BuilderActionPresetsPanelProps = {
  newPreset: RuntimeActionPreset;
  onAddLibraryPreset: (preset: RosMessageCommandPreset) => void;
  onAddPreset: () => void;
  onNewPresetChange: (patch: Partial<RuntimeActionPreset>) => void;
  onRemovePreset: (presetId: string) => void;
  onUpdatePreset?: (presetId: string, patch: Partial<RuntimeActionPreset>) => void;
  presets: readonly RuntimeActionPreset[];
  robotName?: string | null;
};

const PRESET_KINDS: ReadonlyArray<[string, string]> = [
  ["topic-publish", "Topic publish"],
  [SERVICE_CALL_KIND, "Service call"],
];

type PresetField = {
  editing: Parameters<typeof getTouchEditingProps>[0];
  field: "command" | "message_type" | "name" | "topic";
  label: string;
  placeholder: string;
};

const NAME_FIELDS: readonly PresetField[] = [
  { editing: "name", field: "name", label: "Preset name", placeholder: "Emergency stop" },
  { editing: "text", field: "command", label: "Command", placeholder: "behaviour/joint_target/home" },
];

const TOPIC_FIELDS: readonly PresetField[] = [
  ...NAME_FIELDS,
  { editing: "text", field: "topic", label: "Topic", placeholder: "/mode_request" },
  { editing: "text", field: "message_type", label: "Message type", placeholder: "std_msgs/msg/Bool" },
];

// A service-call preset reuses `topic` for the service name and `message_type` for the service type.
const SERVICE_FIELDS: readonly PresetField[] = [
  ...NAME_FIELDS,
  { editing: "text", field: "topic", label: "Service", placeholder: "/gripper/enable" },
  { editing: "text", field: "message_type", label: "Service type", placeholder: "std_srvs/srv/SetBool" },
];

/** The payload as the author last wrote it: YAML text, or the stored fields shown as flow YAML. */
function readPayloadDraft(preset: RuntimeActionPreset): string {
  if (preset.payload_text || preset.payload === null || preset.payload === undefined) {
    return preset.payload_text;
  }
  return typeof preset.payload === "string" ? preset.payload : JSON.stringify(preset.payload);
}

function PresetFields({
  onChange,
  preset,
  suffix = "",
}: {
  onChange: (patch: Partial<RuntimeActionPreset>) => void;
  preset: RuntimeActionPreset;
  /** Set on an existing preset's fields, so each has its own accessible name. */
  suffix?: string;
}) {
  const service = preset.kind === SERVICE_CALL_KIND;
  const kinds = PRESET_KINDS.some(([kind]) => kind === preset.kind)
    ? PRESET_KINDS
    : [...PRESET_KINDS, [preset.kind, preset.kind] as [string, string]];
  const typeProblem = describePresetTypeProblem(preset);
  const named = (label: string) => (suffix ? `${label} ${suffix}` : undefined);
  // A card's fields are named by aria-label alone, so a visible "Topic" names only the new-preset form's input.
  const Field = suffix ? "div" : "label";
  return (
    <>
      <Field className="builder-settings-field">
        <span>Preset kind</span>
        <select
          aria-label={named("Preset kind")}
          onChange={(event) => onChange({ kind: event.target.value })}
          value={preset.kind}
        >
          {kinds.map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {(service ? SERVICE_FIELDS : TOPIC_FIELDS).map(({ editing, field, label, placeholder }) => (
        <Field className="builder-settings-field" key={field}>
          <span>{label}</span>
          <input
            {...getTouchEditingProps(editing)}
            aria-label={named(label)}
            onChange={(event) => onChange({ [field]: event.target.value })}
            placeholder={placeholder}
            type="text"
            value={preset[field]}
          />
        </Field>
      ))}
      {typeProblem ? (
        <p className="builder-settings-destination-refusal" role="alert">
          {typeProblem}
        </p>
      ) : null}
      <Field className="builder-settings-field">
        <span>{service ? "Request fields (YAML)" : "Payload"}</span>
        <textarea
          {...getTouchEditingProps("text")}
          aria-label={named(service ? "Request fields (YAML)" : "Payload")}
          onChange={(event) => onChange({ payload: null, payload_text: event.target.value })}
          placeholder="{data: true}"
          rows={3}
          value={readPayloadDraft(preset)}
        />
      </Field>
      {service ? (
        <p className="builder-inspector-copy">
          Leave it empty for a service whose request has no fields, such as Trigger.
        </p>
      ) : null}
    </>
  );
}

export function BuilderActionPresetsPanel({
  newPreset,
  onAddLibraryPreset,
  onAddPreset,
  onNewPresetChange,
  onRemovePreset,
  onUpdatePreset,
  presets,
  robotName,
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
        Save common app commands once, then pick them by name in a command button's Reusable preset setting. A preset
        publishes on a topic or calls a ROS service.
      </p>
      <ul className="builder-action-preset-library" aria-label="Reusable command preset library">
        {commandPresetGroupsFor(robotName).map(([category, libraryPresets]) => (
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
              <small>
                {preset.kind === SERVICE_CALL_KIND && preset.topic
                  ? `Calls ${preset.topic}`
                  : preset.topic || preset.command || "No runtime target configured yet."}
              </small>
              <button
                aria-label={`Remove ${preset.name} preset`}
                onClick={() => onRemovePreset(preset.id)}
                type="button"
              >
                Remove
              </button>
              {onUpdatePreset ? (
                <details className="builder-action-preset-edit">
                  <summary>Edit {preset.name}</summary>
                  <PresetFields
                    onChange={(patch) => onUpdatePreset(preset.id, patch)}
                    preset={preset}
                    suffix={`of ${preset.id}`}
                  />
                </details>
              ) : null}
            </article>
          ))
        )}
      </div>
      <div className="builder-action-preset-form">
        <PresetFields onChange={onNewPresetChange} preset={newPreset} />
        <button disabled={!newPreset.name.trim()} onClick={onAddPreset} type="button">
          Add preset
        </button>
      </div>
    </section>
  );
}

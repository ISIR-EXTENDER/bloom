import type { CanvasSettings, WidgetConfig } from "@bloom/api-client";
import {
  deriveSliderStep,
  findInertSetting,
  getDefaultRosMessageTogglePayloads,
  getWidgetSettingsContract,
  normalizeWidgetSettings,
  readOptionalNumber,
  resolveWidgetDestination,
  type WidgetSettingField,
} from "@bloom/widgets";
import { useState } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";
import { AxisMappingEditor } from "./AxisMappingEditor";
import { BuilderSettingsField, coerceFieldValue } from "./BuilderSettingsField";
import { WidgetCliPreview, WidgetDestinationSummary, WidgetGlassSizeSummary } from "./BuilderWidgetSummaries";
import { TOUCH_FLOOR_PX } from "./builder-geometry";

type BuilderWidgetSettingsEditorProps = {
  /** The frames this robot accepts, for a pad that turns the hand in its own. */
  allowedCommandFrameIds?: readonly string[];
  /** The app's teleop list, so a target the runtime will refuse is named before it goes live. */
  allowedParameters?: readonly string[];
  allowedTeleopTargets?: readonly string[];
  serverTeleopTargets?: readonly string[];
  canvas?: CanvasSettings;
  /** The fit scale of this screen's own device class, as the inspector measured it. */
  /** The floor this screen's device class is held to: the touch floor on a tablet, the mouse one on a desktop. */
  floorPx?: number;
  glassScale?: number;
  panel?: { height: number; width: number };
  onUpdateSettings: (settings: Record<string, unknown>) => string | null;
  onUpdateTitle: (title: string) => void;
  widget: WidgetConfig;
};

export function BuilderWidgetSettingsEditor({
  allowedCommandFrameIds,
  allowedParameters,
  allowedTeleopTargets,
  serverTeleopTargets,
  canvas,
  floorPx = TOUCH_FLOOR_PX,
  panel = { height: 600, width: 1024 },
  onUpdateSettings,
  onUpdateTitle,
  widget,
}: BuilderWidgetSettingsEditorProps) {
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const contract = getWidgetSettingsContract(widget.kind);
  const normalizedSettings = normalizeWidgetSettings(widget.kind, widget.settings);
  const effectiveSettings = normalizedSettings.success ? normalizedSettings.settings : widget.settings;
  const destination = resolveWidgetDestination(widget.kind, effectiveSettings);

  const updateSetting = (field: WidgetSettingField, rawValue: string | boolean) => {
    const nextSettings: Record<string, unknown> = {
      ...widget.settings,
      [field.key]: coerceFieldValue(field, rawValue),
    };
    if (nextSettings[field.key] === undefined) {
      delete nextSettings[field.key];
    }
    // Step follows the range (~20 increments); a direct step edit overrides.
    if (widget.kind === "slider" && (field.key === "min" || field.key === "max")) {
      const min = readOptionalNumber(nextSettings.min ?? effectiveSettings.min);
      const max = readOptionalNumber(nextSettings.max ?? effectiveSettings.max);
      if (min !== undefined && max !== undefined && max !== min) {
        nextSettings.step = deriveSliderStep(min, max);
      }
    }
    // A toggle's payloads are ROS text, not JSON, and every message type wants a different shape. An
    // author who picks a type and is left to write "{data: [1.1]}" from memory gets a toggle that
    // publishes nothing. Carry the matching pair across, unless they have written their own.
    if (widget.kind === "toggle" && field.key === "messageType") {
      const previous = getDefaultRosMessageTogglePayloads(String(effectiveSettings.messageType ?? ""));
      const untouched =
        (effectiveSettings.onPayload ?? "") === previous.onPayload &&
        (effectiveSettings.offPayload ?? "") === previous.offPayload;
      if (untouched || !effectiveSettings.onPayload) {
        const suggested = getDefaultRosMessageTogglePayloads(String(rawValue));
        nextSettings.onPayload = suggested.onPayload;
        nextSettings.offPayload = suggested.offPayload;
      }
    }
    setValidationMessage(onUpdateSettings(nextSettings));
  };

  return (
    <section className="builder-settings-editor" aria-labelledby="builder-settings-editor-title">
      <div>
        <p className="eyebrow">Settings</p>
        <h3 id="builder-settings-editor-title">Widget configuration</h3>
      </div>

      <label className="builder-settings-field">
        <span>Title</span>
        <input
          {...getTouchEditingProps("name")}
          onChange={(event) => onUpdateTitle(event.target.value)}
          type="text"
          value={widget.title}
        />
      </label>

      <WidgetDestinationSummary
        allowedParameters={allowedParameters}
        allowedTeleopTargets={allowedTeleopTargets}
        destination={destination}
        serverTeleopTargets={serverTeleopTargets}
        widget={widget}
      />
      <WidgetCliPreview widget={widget} />
      <AxisMappingEditor
        allowedCommandFrameIds={allowedCommandFrameIds}
        allowedTeleopTargets={allowedTeleopTargets}
        onUpdateSettings={onUpdateSettings}
        widget={widget}
      />
      <WidgetGlassSizeSummary canvas={canvas} floorPx={floorPx} panel={panel} widget={widget} />

      {contract.fields.length === 0 ? (
        // Only a kind Bloom does not know reaches here, which is an import's doing, not the author's.
        <p className="builder-inspector-copy">
          {contract.kind === "unknown"
            ? `Bloom does not know the kind "${widget.kind}". It came from an import; replace it with a widget from the palette.`
            : "This widget has no settings."}
        </p>
      ) : (
        contract.fields.map((field) => (
          <BuilderSettingsField
            defaultValue={contract.defaultSettings[field.key]}
            field={field}
            key={field.key}
            onChange={(rawValue) => updateSetting(field, rawValue)}
            inert={findInertSetting(destination, field.key)}
            onClear={() => updateSetting(field, "")}
            value={effectiveSettings[field.key]}
          />
        ))
      )}

      {validationMessage ? (
        <p className="builder-settings-error" role="alert">
          {validationMessage}
        </p>
      ) : null}
    </section>
  );
}

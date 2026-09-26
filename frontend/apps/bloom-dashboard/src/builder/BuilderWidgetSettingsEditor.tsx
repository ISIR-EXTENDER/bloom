import type { CanvasSettings, WidgetConfig } from "@bloom/api-client";
import {
  deriveSliderStep,
  findInertSetting,
  getDefaultRosMessageTogglePayloads,
  getWidgetSettingsContract,
  gripperToggleSettings,
  isRecord,
  normalizeWidgetSettings,
  readOptionalNumber,
  resolveWidgetDestination,
  type WidgetSettingField,
} from "@bloom/widgets";
import { useId, useState } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";
import { AxisMappingEditor } from "./AxisMappingEditor";
import { BuilderSettingsField, coerceFieldValue } from "./BuilderSettingsField";
import { WidgetCliPreview, WidgetDestinationSummary, WidgetGlassSizeSummary } from "./BuilderWidgetSummaries";
import { TOUCH_FLOOR_PX } from "./builder-geometry";
import { RequiredTextInput } from "./RequiredTextInput";
import { SERIES_KINDS, SeriesEditor } from "./SeriesEditor";

type BuilderWidgetSettingsEditorProps = {
  /** The frames this robot accepts, for a pad that turns the hand in its own. */
  allowedCommandFrameIds?: readonly string[];
  /** The app's teleop list, so a target the runtime will refuse is named before it goes live. */
  allowedParameters?: readonly string[];
  allowedTeleopTargets?: readonly string[];
  serverTeleopTargets?: readonly string[];
  canvas?: CanvasSettings;
  /** The floor this screen's device class is held to: the touch floor on a tablet, the mouse one on a desktop. */
  floorPx?: number;
  /** The fit scale of this screen's own device class, as the inspector measured it. */
  glassScale?: number;
  panel?: { height: number; width: number };
  onUpdateSettings: (settings: Record<string, unknown>) => string | null;
  onUpdateTitle: (title: string) => void;
  /** The other widgets on this screen: a series picker is linked to one of its plot boards by name. */
  screenWidgets?: readonly WidgetConfig[];
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
  screenWidgets = [],
  widget,
}: BuilderWidgetSettingsEditorProps) {
  const titleId = useId();
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
      const gripperPairs = (["explorer", "kinova"] as const)
        .map((robot) => gripperToggleSettings(robot))
        .filter((pair) => pair.messageType === effectiveSettings.messageType);
      const placed = [previous, ...gripperPairs];
      // The palette places the gripper's calibrated pair, which counts as untouched too.
      const untouched = placed.some(
        (pair) =>
          (effectiveSettings.onPayload ?? "") === pair.onPayload &&
          (effectiveSettings.offPayload ?? "") === pair.offPayload,
      );
      if (untouched || !effectiveSettings.onPayload) {
        const suggested = getDefaultRosMessageTogglePayloads(String(rawValue));
        nextSettings.onPayload = suggested.onPayload;
        nextSettings.offPayload = suggested.offPayload;
      }
    }
    // A mode button sends {data: <command>}; a new command left the old one going out.
    if (widget.kind === "command-button" && field.key === "command") {
      const payload = effectiveSettings.payload;
      const previous = String(effectiveSettings.command ?? "");
      const followsCommand =
        payload === "" ||
        payload === undefined ||
        (isRecord(payload) && Object.keys(payload).length === 1 && payload.data === previous);
      if (followsCommand && String(effectiveSettings.messageType ?? "") === "std_msgs/msg/String") {
        nextSettings.payload = { data: String(rawValue) };
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

      <label className="builder-settings-field" htmlFor={titleId}>
        <span>Title</span>
        <RequiredTextInput
          id={titleId}
          {...getTouchEditingProps("name")}
          fallback="Untitled widget"
          onCommit={onUpdateTitle}
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
      <SeriesEditor onUpdateSettings={onUpdateSettings} widget={widget} />
      <WidgetGlassSizeSummary canvas={canvas} floorPx={floorPx} panel={panel} widget={widget} />

      {contract.fields.length === 0 ? (
        // Only a kind Bloom does not know reaches here, which is an import's doing, not the author's.
        <p className="builder-inspector-copy">
          {contract.kind === "unknown"
            ? `Bloom does not know the kind "${widget.kind}". It came from an import; replace it with a widget from the palette.`
            : "This widget has no settings."}
        </p>
      ) : (
        contract.fields.map((field) =>
          // The series editor above carries these as rows; the raw array would be a second way in.
          field.key === "series" && SERIES_KINDS.has(widget.kind) ? null : widget.kind === "plot-picker" &&
            field.key === "plot_id" ? (
            <PlotBoardField
              boards={screenWidgets.filter((candidate) => candidate.kind === "plot-board")}
              key={field.key}
              onChange={(boardId) => updateSetting(field, boardId)}
              value={String(effectiveSettings.plot_id ?? "")}
            />
          ) : (
            <BuilderSettingsField
              defaultValue={contract.defaultSettings[field.key]}
              field={field}
              key={field.key}
              onChange={(rawValue) => updateSetting(field, rawValue)}
              inert={findInertSetting(destination, field.key)}
              onClear={() => updateSetting(field, "")}
              value={effectiveSettings[field.key]}
            />
          ),
        )
      )}

      {validationMessage ? (
        <p className="builder-settings-error" role="alert">
          {validationMessage}
        </p>
      ) : null}
    </section>
  );
}

/** The board a series picker drives, chosen by title: the field asked for a widget id nobody can see. */
function PlotBoardField({
  boards,
  onChange,
  value,
}: {
  boards: readonly WidgetConfig[];
  onChange: (boardId: string) => void;
  value: string;
}) {
  const linked = boards.some((board) => board.id === value);
  return (
    <label className="builder-settings-field">
      <span>Plot board</span>
      <select onChange={(event) => onChange(event.target.value)} value={linked ? value : ""}>
        <option value="">{boards.length === 0 ? "No plot board on this screen" : "Choose a plot board"}</option>
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.title}
          </option>
        ))}
      </select>
      {!linked ? (
        <small className="builder-settings-pending" role="status">
          {boards.length === 0
            ? "Add a plot board to this screen; the picker shows and hides its series."
            : value
              ? `"${value}" is not a plot board on this screen, so the picker controls nothing.`
              : "Not linked yet, so the picker controls nothing."}
        </small>
      ) : null}
    </label>
  );
}

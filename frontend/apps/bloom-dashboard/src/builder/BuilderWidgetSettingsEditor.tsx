import type { CanvasSettings, WidgetConfig } from "@bloom/api-client";
import {
  asRecord,
  COMMAND_PURPOSE_KEYS,
  COMMAND_PURPOSES,
  commandPurposeOf,
  commandPurposesFor,
  DEFAULT_WIDGET_DEFINITIONS,
  deriveSliderStep,
  fieldSuggestionsFor,
  findInertSetting,
  followTopicMessageType,
  getDefaultRosMessageTogglePayloads,
  getWidgetSettingsContract,
  gripperToggleSettings,
  isRecord,
  JOYSTICK_PURPOSE_KEYS,
  JOYSTICK_PURPOSES,
  joystickPurposeOf,
  normalizeWidgetSettings,
  readOptionalNumber,
  resolveWidgetDestination,
  SLIDER_PURPOSE_KEYS,
  SLIDER_PURPOSES,
  sliderPurposeOf,
  TOPIC_SUGGESTIONS,
  type WidgetSettingField,
} from "@bloom/widgets";
import { useEffect, useId, useRef, useState } from "react";
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
  allowedPublishTopics?: readonly string[];
  serverTeleopTargets?: readonly string[];
  canvas?: CanvasSettings;
  /** The floor this screen's device class is held to: the touch floor on a tablet, the mouse one on a desktop. */
  floorPx?: number;
  /** The fit scale of this screen's own device class, as the inspector measured it. */
  glassScale?: number;
  panel?: { height: number; width: number };
  onUpdateSettings: (settings: Record<string, unknown>, title?: string) => string | null;
  onUpdateTitle: (title: string) => void;
  /** The arm this Bloom drives, so a speed limit takes that arm's range. */
  robotName?: string;
  /** The other widgets on this screen: a series picker is linked to one of its plot boards by name. */
  screenWidgets?: readonly WidgetConfig[];
  widget: WidgetConfig;
};

// The kinds with a "what it does" choice. A toggle has none, so its topic and payloads stay in view.
const ADVANCED_FIELD_KINDS: ReadonlySet<string> = new Set(["command-button", "joystick", "slider"]);
const ADVANCED_FIELD_KEYS: ReadonlySet<string> = new Set([
  "action_id",
  "action_label",
  "axis_hints",
  "binding",
  "cancellable",
  "command",
  "intent_label",
  "messageType",
  "mode_id",
  "offPayload",
  "onPayload",
  "payload",
  "presetId",
  "publish_rate_hz",
  "releasedPayload",
  "runtime_binding",
  "topic",
  "zero_on_release",
]);

export function BuilderWidgetSettingsEditor({
  allowedCommandFrameIds,
  allowedParameters,
  allowedTeleopTargets,
  allowedPublishTopics,
  serverTeleopTargets,
  canvas,
  floorPx = TOUCH_FLOOR_PX,
  panel = { height: 600, width: 1024 },
  onUpdateSettings,
  onUpdateTitle,
  robotName,
  screenWidgets = [],
  widget,
}: BuilderWidgetSettingsEditorProps) {
  const titleId = useId();
  const suggestionId = useId();
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
    // A reader's type was the old topic's, and the backend subscribed with it: /ee_pose's PoseStamped on
    // /joint_states waited forever. Empty, the backend reads the type from the graph.
    if (field.key === "topic" && destination?.direction === "reads" && nextSettings.topic !== widget.settings.topic) {
      const followed = followTopicMessageType(
        widget.settings.topic,
        nextSettings.topic,
        widget.settings.messageType ?? widget.settings.message_type,
      );
      delete nextSettings.message_type;
      if (followed) {
        nextSettings.messageType = followed;
      } else {
        delete nextSettings.messageType;
      }
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
      if (effectiveSettings.action_label === `Request ${previous}`) {
        nextSettings.action_label = `Request ${String(rawValue)}`;
      }
    }
    setValidationMessage(onUpdateSettings(nextSettings));
  };

  // Each choice writes what the shipped Manager apps use, replacing every key the old purpose owned. A title
  // the author wrote stays; one that only named the old purpose follows the new one.
  const choosePurpose = (
    purpose: Purpose,
    purposes: readonly Purpose[],
    ownedKeys: readonly string[],
    purposeOf: (settings: Record<string, unknown>) => string | null,
  ) => {
    const kept = Object.fromEntries(Object.entries(widget.settings).filter(([key]) => !ownedKeys.includes(key)));
    const previous = purposes.find((candidate) => candidate.id === purposeOf(widget.settings));
    const defaultTitle = DEFAULT_WIDGET_DEFINITIONS.find((definition) => definition.kind === widget.kind)?.defaultTitle;
    const followsPurpose = !widget.title.trim() || widget.title === previous?.title || widget.title === defaultTitle;
    // One commit: a title committed after the settings, from the same draft, used to drop them.
    setValidationMessage(
      onUpdateSettings({ ...kept, ...purpose.settings(robotName) }, followsPurpose ? purpose.title : undefined),
    );
  };

  // The ROS plumbing of a control that says in words what it does: the choice above writes it, and 24 raw fields
  // in one list buried the four an author changes.
  const isAdvanced = (field: WidgetSettingField) =>
    ADVANCED_FIELD_KINDS.has(widget.kind) && ADVANCED_FIELD_KEYS.has(field.key);
  const basicFields = contract.fields.filter((field) => !isAdvanced(field));
  // Folded fields must not hide what needs doing: no purpose chosen means they are the settings, and an error
  // naming one of them points at a field nobody can see.
  const advancedRef = useRef<HTMLDetailsElement | null>(null);
  const purposeChosen =
    widget.kind === "slider"
      ? sliderPurposeOf(widget.settings) !== null
      : widget.kind === "command-button"
        ? commandPurposeOf(widget.settings) !== null
        : widget.kind === "joystick"
          ? joystickPurposeOf(widget.settings) !== null
          : true;
  // Matched as the field names lead each error, after the widget prefix: the prefix carried the widget id
  // ("command-button-3"), so every error on a button looked like one about "command".
  const errorDetail = validationMessage?.replace(/^Invalid settings for widget "[^"]*": /, "") ?? "";
  const errorNamesAdvanced = [...ADVANCED_FIELD_KEYS].some((key) => new RegExp(`(^|; )${key}[.:]`).test(errorDetail));
  useEffect(() => {
    if (advancedRef.current && (!purposeChosen || errorNamesAdvanced)) {
      advancedRef.current.open = true;
    }
  }, [purposeChosen, errorNamesAdvanced]);
  const advancedFields = contract.fields.filter(isAdvanced);
  const renderField = (field: WidgetSettingField) =>
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
        suggestionListId={
          field.key === "topic"
            ? `${suggestionId}-topics`
            : field.key === "fieldPath" || field.key === "field_path"
              ? `${suggestionId}-fields`
              : undefined
        }
        value={effectiveSettings[field.key]}
      />
    );

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
        allowedPublishTopics={allowedPublishTopics}
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
      {widget.kind === "slider" ? (
        <PurposeField
          label="What this slider controls"
          onChoose={(purpose) => choosePurpose(purpose, SLIDER_PURPOSES, SLIDER_PURPOSE_KEYS, sliderPurposeOf)}
          purposes={SLIDER_PURPOSES}
          value={sliderPurposeOf(widget.settings)}
        />
      ) : null}
      {widget.kind === "joystick" ? (
        <PurposeField
          label="What this pad does"
          onChoose={(purpose) => choosePurpose(purpose, JOYSTICK_PURPOSES, JOYSTICK_PURPOSE_KEYS, joystickPurposeOf)}
          purposes={JOYSTICK_PURPOSES}
          value={joystickPurposeOf(widget.settings)}
        />
      ) : null}
      {widget.kind === "command-button" ? (
        <PurposeField
          label="What this button does"
          onChoose={(purpose) => choosePurpose(purpose, COMMAND_PURPOSES, COMMAND_PURPOSE_KEYS, commandPurposeOf)}
          // A purpose this arm does not offer stays listed when the button already has it, disabled, so the
          // choice reads what the button does instead of "Something else".
          purposes={
            commandPurposesFor(robotName).some((purpose) => purpose.id === commandPurposeOf(widget.settings)) ||
            commandPurposeOf(widget.settings) === null
              ? commandPurposesFor(robotName)
              : COMMAND_PURPOSES
          }
          unavailable={(purpose) => {
            if (!commandPurposesFor(robotName).includes(purpose)) {
              return "not on this robot";
            }
            // A frame this robot does not accept arrives disabled at runtime; say so before it is chosen.
            const frameId = asRecord(purpose.settings().runtime_binding).frame_id;
            return typeof frameId === "string" && allowedCommandFrameIds && !allowedCommandFrameIds.includes(frameId)
              ? "not on this robot"
              : null;
          }}
          value={commandPurposeOf(widget.settings)}
        />
      ) : null}
      <WidgetGlassSizeSummary canvas={canvas} floorPx={floorPx} panel={panel} widget={widget} />

      {contract.fields.length === 0 ? (
        // Only a kind Bloom does not know reaches here, which is an import's doing, not the author's.
        <p className="builder-inspector-copy">
          {contract.kind === "unknown"
            ? `Bloom does not know the kind "${widget.kind}". It came from an import; replace it with a widget from the palette.`
            : "This widget has no settings."}
        </p>
      ) : (
        <>
          {basicFields.map(renderField)}
          {advancedFields.length > 0 ? (
            <details className="builder-settings-advanced" ref={advancedRef}>
              <summary>Advanced (ROS)</summary>
              {advancedFields.map(renderField)}
            </details>
          ) : null}
        </>
      )}

      <datalist id={`${suggestionId}-topics`}>
        {TOPIC_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion.topic} value={suggestion.topic} />
        ))}
      </datalist>
      <datalist id={`${suggestionId}-fields`}>
        {fieldSuggestionsFor(effectiveSettings.topic).map((fieldPath) => (
          <option key={fieldPath} value={fieldPath} />
        ))}
      </datalist>

      {validationMessage ? (
        <p className="builder-settings-error" role="alert">
          {describeValidation(validationMessage, contract.fields)}
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

type Purpose = { id: string; label: string; title: string; settings: (robotName?: string) => Record<string, unknown> };

/** What a slider or button drives, in words: each choice writes what the shipped Manager apps use. */
function PurposeField({
  label,
  onChoose,
  purposes,
  unavailable,
  value,
}: {
  label: string;
  onChoose: (purpose: Purpose) => void;
  purposes: readonly Purpose[];
  /** Why a purpose cannot work here, or null. */
  unavailable?: (purpose: Purpose) => string | null;
  value: string | null;
}) {
  return (
    <label className="builder-settings-field">
      <span>{label}</span>
      <select
        onChange={(event) => {
          const purpose = purposes.find((candidate) => candidate.id === event.target.value);
          if (purpose) {
            onChoose(purpose);
          }
        }}
        value={value ?? ""}
      >
        <option value="">Something else (set under Advanced)</option>
        {purposes.map((purpose) => {
          const reason = unavailable?.(purpose) ?? null;
          return (
            <option disabled={reason !== null} key={purpose.id} value={purpose.id}>
              {reason ? `${purpose.label} (${reason})` : purpose.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/**
 * The settings error in the inspector's words: `Invalid settings for widget "x": runtime_binding.adapter: ...`
 * named a key the author may never have seen. Each key becomes its field's label.
 */
function describeValidation(message: string, fields: readonly WidgetSettingField[]): string {
  const detail = message.replace(/^Invalid settings for widget "[^"]*": /, "");
  return fields.reduce(
    (text, field) => text.replace(new RegExp(`(^|; )${field.key}(\\.[\\w.]+)?: `, "g"), `$1${field.label}: `),
    detail,
  );
}

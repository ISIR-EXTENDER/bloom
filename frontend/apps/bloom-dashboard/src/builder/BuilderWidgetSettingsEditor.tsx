import type { CanvasSettings, WidgetConfig } from "@bloom/api-client";
import {
  buildCliPreview,
  deriveSliderStep,
  findInertSetting,
  getDefaultRosMessageTogglePayloads,
  getWidgetSettingsContract,
  INTERACTIVE_WIDGET_KINDS,
  normalizeWidgetSettings,
  resolveCanvasFitScale,
  resolveCanvasPresetSize,
  resolveWidgetDestination,
  type WidgetDestination,
  type WidgetSettingField,
} from "@bloom/widgets";
import { useEffect, useState } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";
import { AxisMappingEditor } from "./AxisMappingEditor";
import { glassPx, TOUCH_FLOOR_PX } from "./builder-geometry";

type BuilderWidgetSettingsEditorProps = {
  /** The app's teleop list, so a target the runtime will refuse is named before it goes live. */
  allowedTeleopTargets?: readonly string[];
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

const FIT_OVERFLOW_GUARD = 0.99;

/**
 * The same command on the terminal.
 *
 * A form is abstract. This is a sentence an author can paste into a shell and check against a running
 * robot without the app, without a session and without asking anyone -- and the first thing to try when
 * a control does nothing. A toggle sends two different messages, so it gets both lines.
 */
function WidgetCliPreview({ widget }: { widget: WidgetConfig }) {
  const settings = widget.settings ?? {};
  const lines =
    widget.kind === "toggle"
      ? [
          ["ON", buildCliPreview(widget.kind, settings, settings.onPayload)],
          ["OFF", buildCliPreview(widget.kind, settings, settings.offPayload)],
        ]
      : [["", buildCliPreview(widget.kind, settings, settings.payload)]];
  const shown = lines.filter(([, line]) => line !== null);

  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="builder-cli-preview">
      <p className="builder-inspector-copy">The same command on the terminal:</p>
      {shown.map(([label, line]) => (
        <code key={label}>
          {label ? `${label}: ` : ""}
          {line}
        </code>
      ))}
    </div>
  );
}

function WidgetGlassSizeSummary({
  canvas,
  floorPx,
  panel,
  widget,
}: {
  canvas?: CanvasSettings;
  floorPx: number;
  panel: { height: number; width: number };
  widget: WidgetConfig;
}) {
  if (!canvas) {
    return null;
  }
  const artboard = resolveCanvasPresetSize(canvas);
  // Fit against the panel this screen's own device class is checked at, not the tablet every time.
  // Measured against 1024x600 regardless, a desktop screen was scaled to a panel it will never run on
  // and every interactive control on it reported a target below the floor, with nothing an author
  // could do about it.
  const scale = canvas.runtime_mode === "fit" ? resolveCanvasFitScale(canvas, artboard, panel) * FIT_OVERFLOW_GUARD : 1;
  const glassWidth = Math.round(widget.layout.width * scale);
  const glassHeight = Math.round(widget.layout.height * scale);
  // Measure what the hand meets as well as the card around it. The card alone could never fail for a
  // widget that met its minimum size, so it reassured an author while the inspector was warning; the
  // target alone misses a card too small to hold it, because some kinds declare a fixed target.
  const interactive = INTERACTIVE_WIDGET_KINDS.has(widget.kind);
  const target = interactive ? Math.min(glassPx(widget, scale), glassWidth, glassHeight) : null;
  const belowFloor = target !== null && target < floorPx;

  return (
    <div className="builder-glass-size" data-below-floor={belowFloor ? "true" : "false"}>
      <p className="builder-inspector-copy">
        On the {panel.width}×{panel.height} panel: <strong>{`${glassWidth} × ${glassHeight} px`}</strong> of glass
        (scale {scale.toFixed(2)}).
      </p>
      {belowFloor ? (
        <p className="builder-glass-size-warning" role="alert">
          Its target is {target} px, below the {floorPx}px floor for this panel. The size tokens are honest; the fit
          scale discounts them — make the control larger instead of trusting the authored size.
        </p>
      ) : null}
    </div>
  );
}

export function BuilderWidgetSettingsEditor({
  allowedTeleopTargets,
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
      const min = readFiniteNumber(nextSettings.min ?? effectiveSettings.min);
      const max = readFiniteNumber(nextSettings.max ?? effectiveSettings.max);
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

      <WidgetDestinationSummary allowedTeleopTargets={allowedTeleopTargets} destination={destination} widget={widget} />
      <WidgetCliPreview widget={widget} />
      <AxisMappingEditor onUpdateSettings={onUpdateSettings} widget={widget} />
      <WidgetGlassSizeSummary canvas={canvas} floorPx={floorPx} panel={panel} widget={widget} />

      {contract.fields.length === 0 ? (
        <p className="builder-inspector-copy">This widget does not expose configurable settings yet.</p>
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

/**
 * States where the widget's output actually goes.
 *
 * The inspector previously showed an editable "Output topic" beside a runtime
 * binding that overrode it, with nothing saying which one won. A researcher
 * setting a topic and seeing no change has no way to tell whether the field is
 * ignored, the robot is disconnected, or they made a typo.
 */
function WidgetDestinationSummary({
  allowedTeleopTargets,
  destination,
  widget,
}: {
  allowedTeleopTargets?: readonly string[];
  destination: WidgetDestination | null;
  widget: WidgetConfig;
}) {
  // Kinds whose data flow is not modelled get no panel at all. A guess here is
  // worse than silence: it is what made the inspector misleading to begin with.
  if (!destination) {
    return null;
  }

  // Robin, 2026-09-23: "est-il possible de rendre paramétrable le nom du topic ? Lorsque l'on
  // remplace /joystick_cartesian_command par autre chose, ça ne fonctionne plus." It is
  // parameterisable; what stopped it is the app's own teleop list, which the runtime narrows the
  // socket to. Nothing said so until the control was live and refused.
  const teleopTarget =
    destination.direction === "publishes" && resolveTeleopAdapter(widget.settings) ? (destination.topic ?? "") : "";
  const outsidePolicy =
    Boolean(teleopTarget) &&
    Boolean(allowedTeleopTargets) &&
    !allowedTeleopTargets?.includes("*") &&
    !allowedTeleopTargets?.includes(teleopTarget);

  const label = destination.direction === "reads" ? "Reads from" : "Publishes to";
  const emptyLabel = destination.direction === "reads" ? "No topic set" : "Not configured";

  return (
    <div
      className="builder-settings-destination"
      data-direction={destination.direction}
      data-source={destination.source}
    >
      <span className="builder-settings-destination-label">{label}</span>
      {destination.topic ? (
        <code className="builder-settings-destination-topic">{destination.topic}</code>
      ) : (
        <span className="builder-settings-destination-topic builder-settings-destination-none">{emptyLabel}</span>
      )}
      {destination.detail ? <p className="builder-settings-destination-summary">{destination.detail}</p> : null}
      {outsidePolicy ? (
        <p className="builder-settings-destination-refusal" role="alert">
          This app does not allow teleop on {teleopTarget}, so the runtime will refuse it. Add it under App
          configuration, Adapter guardrails, Teleop targets.
        </p>
      ) : null}
    </div>
  );
}

/** True when this widget contributes to the composed twist, which is what the teleop list governs. */
function resolveTeleopAdapter(settings: Record<string, unknown>): boolean {
  const binding = settings.runtime_binding;
  return Boolean(binding && typeof binding === "object" && (binding as { adapter?: unknown }).adapter === "teleop");
}

function isSameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function BuilderSettingsField({
  defaultValue,
  field,
  inert,
  onChange,
  onClear,
  value,
}: {
  /** What the contract gave this field, so an untouched inert setting stays quiet. */
  defaultValue?: unknown;
  field: WidgetSettingField;
  inert?: { key: string; reason: string };
  onChange: (value: string | boolean) => void;
  onClear: () => void;
  value: unknown;
}) {
  // A setting the runtime ignores is not worth an editable control. When it is
  // empty, or still holds what the contract gave it, there is nothing to say and
  // it is hidden as pure noise. When someone chose a value it stays visible and
  // disabled, because a stale value that quietly does nothing is exactly what
  // would mislead the next person to open this widget, and they need a way to
  // clear it.
  if (inert) {
    const hasValue = typeof value === "string" ? value.trim().length > 0 : value != null && value !== "";
    if (!hasValue || isSameJsonValue(value, defaultValue)) {
      return null;
    }

    return (
      <div className="builder-settings-field builder-settings-field-inert">
        <span>{field.label}</span>
        <input disabled readOnly type="text" value={String(value)} />
        <p className="builder-settings-field-note">
          {inert.reason}{" "}
          <button className="builder-settings-field-clear" onClick={onClear} type="button">
            Clear it
          </button>
        </p>
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="builder-settings-field builder-settings-checkbox">
        <input checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="builder-settings-field">
        <span>{field.label}</span>
        <select onChange={(event) => onChange(event.target.value)} value={String(value ?? "")}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "json") {
    return <JsonSettingsField field={field} onChange={onChange} value={value} />;
  }

  return (
    <label className="builder-settings-field">
      <span>{field.label}</span>
      <input
        {...getTouchEditingProps(field.type === "number" ? "number" : "text")}
        onChange={(event) => onChange(event.target.value)}
        step={field.type === "number" ? "any" : undefined}
        type={field.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
      />
    </label>
  );
}

/**
 * Keeps half-typed JSON on screen. A keystroke the settings reject leaves the
 * saved value unchanged, and the field used to snap back to it, so a new key
 * could only be pasted whole.
 */
function JsonSettingsField({
  field,
  onChange,
  value,
}: {
  field: WidgetSettingField;
  onChange: (value: string) => void;
  value: unknown;
}) {
  const saved = formatJsonFieldValue(value);
  const [draft, setDraft] = useState(saved);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside change to the saved value replaces the draft.
  useEffect(() => {
    if (!draftMatchesValue(draft, value)) {
      setDraft(saved);
    }
  }, [saved]);

  // These fields hold two different kinds of thing. Some are ROS-ish text the seeds write as a string,
  // like "{data: [1.1]}", which JSON.parse cannot read and which is nonetheless the saved value. Others
  // hold a real object. Only for those does a draft that does not parse mean "still typing": committed
  // per keystroke it replaced the object with a fragment like '{"a": ', which the backend accepts and
  // the runtime then publishes.
  const structured = value !== null && typeof value === "object";
  const pending = structured && draft.trim().length > 0 && !isParsableJson(draft);

  return (
    <label className="builder-settings-field">
      <span>{field.label}</span>
      <textarea
        {...getTouchEditingProps("json")}
        aria-describedby={pending ? `${field.key}-pending` : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          const stillTyping = structured && event.target.value.trim() && !isParsableJson(event.target.value);
          if (!stillTyping) {
            onChange(event.target.value);
          }
        }}
        rows={4}
        value={draft}
      />
      {pending ? (
        <small className="builder-settings-pending" id={`${field.key}-pending`}>
          Not valid JSON yet, so it has not been applied.
        </small>
      ) : null}
    </label>
  );
}

function isParsableJson(rawValue: string): boolean {
  try {
    JSON.parse(rawValue.trim());
    return true;
  } catch {
    return false;
  }
}

function draftMatchesValue(draft: string, value: unknown): boolean {
  const parsed = parseJsonLikeValue(draft);
  return JSON.stringify(parsed) === JSON.stringify(value ?? "");
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function coerceFieldValue(field: WidgetSettingField, rawValue: string | boolean): unknown {
  if (field.type === "boolean") {
    return Boolean(rawValue);
  }

  if (field.type === "number") {
    // An emptied optional number is unset; a required one keeps retuning from 0.
    return rawValue === "" && !field.required ? undefined : Number(rawValue);
  }

  if (field.type === "json" && typeof rawValue === "string") {
    return parseJsonLikeValue(rawValue);
  }

  return rawValue;
}

function parseJsonLikeValue(rawValue: string): unknown {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return "";
  }

  try {
    return JSON.parse(trimmedValue);
  } catch {
    return rawValue;
  }
}

function formatJsonFieldValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "";
}

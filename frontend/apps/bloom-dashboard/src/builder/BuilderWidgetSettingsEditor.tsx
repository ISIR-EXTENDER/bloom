import type { WidgetConfig } from "@bloom/api-client";
import {
  getWidgetSettingsContract,
  normalizeWidgetSettings,
  type WidgetDefinition,
  type WidgetSettingField,
} from "@bloom/widgets";
import { useState } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";
import { findInertSetting, resolveWidgetDestination, type WidgetDestination } from "./widget-destination";

type BuilderWidgetSettingsEditorProps = {
  definition: WidgetDefinition | null;
  onUpdateSettings: (settings: Record<string, unknown>) => string | null;
  onUpdateTitle: (title: string) => void;
  widget: WidgetConfig;
};

export function BuilderWidgetSettingsEditor({
  definition,
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
    const nextSettings = {
      ...widget.settings,
      [field.key]: coerceFieldValue(field, rawValue),
    };
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

      <WidgetDestinationSummary destination={destination} />

      {contract.fields.length === 0 ? (
        <p className="builder-inspector-copy">This widget does not expose configurable settings yet.</p>
      ) : (
        contract.fields.map((field) => (
          <BuilderSettingsField
            field={field}
            key={field.key}
            onChange={(rawValue) => updateSetting(field, rawValue)}
            inert={findInertSetting(destination, field.key)}
            onClear={() => updateSetting(field, "")}
            value={effectiveSettings[field.key]}
          />
        ))
      )}

      {definition?.editor.styleFields.length ? (
        <div className="builder-settings-style-capabilities">
          <span>Style capabilities</span>
          <p>{definition.editor.styleFields.join(", ")}</p>
        </div>
      ) : null}

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
function WidgetDestinationSummary({ destination }: { destination: WidgetDestination | null }) {
  // Kinds whose data flow is not modelled get no panel at all. A guess here is
  // worse than silence: it is what made the inspector misleading to begin with.
  if (!destination) {
    return null;
  }

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
    </div>
  );
}

function BuilderSettingsField({
  field,
  inert,
  onChange,
  onClear,
  value,
}: {
  field: WidgetSettingField;
  inert?: { key: string; reason: string };
  onChange: (value: string | boolean) => void;
  onClear: () => void;
  value: unknown;
}) {
  // A setting the runtime ignores is not worth an editable control. When it is
  // empty there is nothing to say, so it is hidden as pure noise. When it holds
  // a value it stays visible and disabled, because a stale value that quietly
  // does nothing is exactly what would mislead the next person to open this
  // widget, and they need a way to clear it.
  if (inert) {
    const hasValue = typeof value === "string" ? value.trim().length > 0 : value != null && value !== "";
    if (!hasValue) {
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
    return (
      <label className="builder-settings-field">
        <span>{field.label}</span>
        <textarea
          {...getTouchEditingProps("json")}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          value={formatJsonFieldValue(value)}
        />
      </label>
    );
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

function coerceFieldValue(field: WidgetSettingField, rawValue: string | boolean): unknown {
  if (field.type === "boolean") {
    return Boolean(rawValue);
  }

  if (field.type === "number") {
    return Number(rawValue);
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

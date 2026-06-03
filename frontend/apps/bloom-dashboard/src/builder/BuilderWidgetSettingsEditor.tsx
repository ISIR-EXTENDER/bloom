import type { WidgetConfig } from "@bloom/api-client";
import { getWidgetSettingsContract, type WidgetDefinition, type WidgetSettingField } from "@bloom/widgets";
import { useState } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";

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

      {contract.fields.length === 0 ? (
        <p className="builder-inspector-copy">This widget does not expose configurable settings yet.</p>
      ) : (
        contract.fields.map((field) => (
          <BuilderSettingsField
            field={field}
            key={field.key}
            onChange={(rawValue) => updateSetting(field, rawValue)}
            value={widget.settings[field.key]}
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

function BuilderSettingsField({
  field,
  onChange,
  value,
}: {
  field: WidgetSettingField;
  onChange: (value: string | boolean) => void;
  value: unknown;
}) {
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

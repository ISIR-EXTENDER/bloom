import type { WidgetSettingField } from "@bloom/widgets";
import { useEffect, useState } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";
export function BuilderSettingsField({
  defaultValue,
  disabledReason,
  field,
  inert,
  onChange,
  onClear,
  suggestionListId,
  value,
}: {
  /** A datalist of likely values (the stack's topics, a topic's fields); typing anything else stays allowed. */
  suggestionListId?: string;
  /** What the contract gave this field, so an untouched inert setting stays quiet. */
  defaultValue?: unknown;
  /** Why a checkbox cannot be ticked here; an already ticked one can still be cleared. */
  disabledReason?: string;
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
        <input
          checked={Boolean(value)}
          disabled={Boolean(disabledReason) && !value}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>{field.label}</span>
        {disabledReason ? <small className="builder-settings-pending">{disabledReason}</small> : null}
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

  if (field.type === "number") {
    return <NumberSettingsField field={field} onChange={onChange} value={value} />;
  }

  return (
    <label className="builder-settings-field">
      <span>{field.label}</span>
      <input
        {...getTouchEditingProps("text")}
        list={suggestionListId}
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={String(value ?? "")}
      />
    </label>
  );
}

/**
 * Keeps a half-typed number on screen. Committed per keystroke, retyping a slider's Maximum went through "0",
 * which the range check refused, and the field snapped back; an emptied field became 0.
 */
function NumberSettingsField({
  field,
  onChange,
  value,
}: {
  field: WidgetSettingField;
  onChange: (value: string) => void;
  value: unknown;
}) {
  const saved = value === undefined || value === null ? "" : String(value);
  const [draft, setDraft] = useState(saved);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside change to the saved value replaces the draft.
  useEffect(() => {
    if (Number(draft) !== Number(saved) || (draft === "") !== (saved === "")) {
      setDraft(saved);
    }
  }, [saved]);

  const commits = (raw: string) =>
    raw === "" ? !field.required : Number.isFinite(Number(raw)) && !/[.eE+-]$/.test(raw);

  return (
    <label className="builder-settings-field">
      <span>{field.label}</span>
      <input
        {...getTouchEditingProps("number")}
        onBlur={() => {
          if (!commits(draft)) {
            setDraft(saved);
          }
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (commits(event.target.value)) {
            onChange(event.target.value);
          }
        }}
        type="text"
        value={draft}
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

export function coerceFieldValue(field: WidgetSettingField, rawValue: string | boolean): unknown {
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

function isSameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

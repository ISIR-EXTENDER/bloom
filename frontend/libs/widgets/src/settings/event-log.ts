import {
  createContract,
  fail,
  isJsonSerializable,
  isStringArray,
  succeed,
  validateBoolean,
  validateNumber,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type EventLogSettings = {
  entries: unknown[];
  fieldPath: string;
  maxEntries: number;
  messageType: string;
  severityFilter: string[];
  show_details: boolean;
  showTimestamps: boolean;
  topic: string;
};

export const EVENT_LOG_DEFAULT_SETTINGS: EventLogSettings = {
  entries: [
    {
      severity: "info",
      summary: "No events yet",
      detail: "Connect a runtime log source or configure static events for this screen.",
    },
  ],
  fieldPath: "",
  maxEntries: 20,
  messageType: "",
  severityFilter: ["info", "warning", "error", "success"],
  show_details: false,
  showTimestamps: true,
  topic: "",
};

export const eventLogContract = createContract(
  "event-log",
  [
    { key: "entries", label: "Entries", type: "json", required: true },
    { key: "topic", label: "Input topic", type: "text", required: false },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "fieldPath", label: "Field path", type: "text", required: false },
    { key: "maxEntries", label: "Maximum entries", type: "number", required: true },
    { key: "severityFilter", label: "Severity filter", type: "json", required: true },
    { key: "showTimestamps", label: "Show timestamps", type: "boolean", required: true },
    { key: "newest_first", label: "Newest first", type: "boolean", required: false },
    // The map that turns a raw mode string into operator language on Command sources.
    { key: "notes", label: "Notes per value", type: "json", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  EVENT_LOG_DEFAULT_SETTINGS,
  validateEventLogSettings,
);

function validateEventLogSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<EventLogSettings> {
  const errors = [
    ...(Array.isArray(settings.entries) ? [] : [{ field: "entries", message: "entries must be an array" }]),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateNumber(settings, "maxEntries", { min: 1 }),
    ...validateBoolean(settings, "showTimestamps"),
    ...validateBoolean(settings, "show_details"),
  ];
  if (!isStringArray(settings.severityFilter)) {
    errors.push({ field: "severityFilter", message: "severityFilter must be an array of strings" });
  }
  if (!isJsonSerializable(settings.entries)) {
    errors.push({ field: "entries", message: "entries must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as EventLogSettings);
}

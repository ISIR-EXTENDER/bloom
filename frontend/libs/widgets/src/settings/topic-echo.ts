import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validateNumber,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type TopicEchoSettings = {
  fieldPath: string;
  maxMessages: number;
  messageType: string;
  prettyPrint: boolean;
  show_details: boolean;
  topic: string;
};

export const TOPIC_ECHO_DEFAULT_SETTINGS: TopicEchoSettings = {
  fieldPath: "",
  maxMessages: 100,
  messageType: "",
  prettyPrint: true,
  show_details: true,
  topic: "",
};

export const topicEchoContract = createContract(
  "topic-echo",
  [
    { key: "topic", label: "Topic", type: "text", required: true },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "fieldPath", label: "Field path", type: "text", required: false },
    { key: "maxMessages", label: "Max messages", type: "number", required: true },
    { key: "prettyPrint", label: "Pretty print", type: "boolean", required: true },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  TOPIC_ECHO_DEFAULT_SETTINGS,
  validateTopicEchoSettings,
);

function validateTopicEchoSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<TopicEchoSettings> {
  const errors = [
    ...validateString(settings, "topic"),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateNumber(settings, "maxMessages", { min: 1 }),
    ...validateBoolean(settings, "prettyPrint"),
    ...validateBoolean(settings, "show_details"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as TopicEchoSettings);
}

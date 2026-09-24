import { asRecord } from "./values";
/**
 * Where a widget's data actually flows, and which settings have no effect.
 *
 * The builder used to show an editable "Output topic" beside a "Runtime binding"
 * that silently overrode it. On a teleop widget the field was never consulted at
 * all: an operator could type a topic, see it saved, and watch nothing change.
 *
 * This resolves the same precedence the runtime uses, so the inspector can state
 * the real topic rather than implying one. Two different runtime paths decide
 * it, and conflating them is its own lie, so both are modelled here:
 *
 * - Publishing widgets go through the runtime action dispatcher, where a
 *   runtime binding outranks the widget's own Output topic.
 * - Reading widgets are subscribed by `RuntimeWorkspace`, which consults only
 *   the widget's own topic setting and ignores runtime bindings entirely.
 *
 * Both are asserted against those real implementations in
 * `widget-destination.test.ts`; if any of them drift, that test fails rather
 * than the UI quietly lying.
 */

export type DestinationDirection = "publishes" | "reads";

export type DestinationSource =
  | "adapter-default"
  | "input-topic"
  | "output-topic"
  | "runtime-binding"
  | "unset"
  | "widget-default";

export type InertSetting = {
  key: string;
  /** Why this setting has no effect, phrased for an operator. */
  reason: string;
};

export type WidgetDestination = {
  direction: DestinationDirection;
  /** The topic, or null when nothing is configured. */
  topic: string | null;
  source: DestinationSource;
  /**
   * What the header and topic do not already say, or null when they say
   * everything. Repeating "Reads from /x" under a "Reads from" heading is
   * noise, and noise is what stops people reading the line that matters.
   */
  detail: string | null;
  /** Settings the runtime ignores for this widget. */
  inertSettings: InertSetting[];
};

/** The manager input a teleop widget falls back to; the legacy /teleop_cmd path needs an explicit target_topic. */
export const TELEOP_DEFAULT_TARGET = "/joystick_cartesian_command";

/**
 * What the legacy `binding` setting still does, per kind.
 *
 * On a joystick it is a fallback that `resolveJoystickBinding` consults only
 * where a newer setting is missing: for the mode when `mode_id` is unset, for
 * the displayed target when the runtime binding has no `target`, and for the
 * default axis labels and colours when `axis_hints` is unset.
 *
 * On a slider it does nothing at all. The renderer never reads it and the
 * dispatcher never reads the `binding` it copies onto the intent, so the field
 * is pure decoration sitting next to the runtime binding that does the work.
 */
const LEGACY_BINDING_INERT_ON_SLIDER =
  "Nothing reads this on a slider. The runtime binding below is what routes the value.";

/**
 * The action contract a command button still declares, and nothing acts on.
 *
 * `createRuntimeActionContract` attaches these to the intent, and no dispatcher, renderer or kiosk
 * surface reads them back: there is no progress indicator and no cancel affordance to drive. They
 * were required fields, so every command button asked an author two questions with no consequence.
 */
const ACTION_CONTRACT_INERT = "Nothing reads this yet: there is no progress or cancel surface to drive.";

/** A gesture pad's `command` is copied onto the intent and no dispatcher reads it back. */
const GESTURE_COMMAND_INERT =
  "Nothing reads this on a gesture pad. The output topic and message type below are what publish.";

/** `robot-3d` draws a joint-state summary; no code fetches a model, which its palette note also says. */
const ROBOT_MODEL_INERT = "Nothing loads a model yet, so this widget draws a joint-state summary instead.";

const ROBOT_MODEL_SETTINGS: InertSetting[] = [
  { key: "modelSource", reason: ROBOT_MODEL_INERT },
  { key: "robotModelUrl", reason: ROBOT_MODEL_INERT },
];

const ACTION_CONTRACT_SETTINGS: InertSetting[] = [
  { key: "action_id", reason: ACTION_CONTRACT_INERT },
  { key: "action_feedback", reason: ACTION_CONTRACT_INERT },
  { key: "cancellable", reason: ACTION_CONTRACT_INERT },
];

const READING_KINDS = new Set(["event-log", "gauge", "jacobian", "joint-table", "plot", "topic-echo", "topic-plot"]);
const JOINT_STATE_KINDS = new Set(["position-library", "robot-3d"]);
const PUBLISHING_KINDS = new Set(["command-button", "gesture-pad", "joystick", "slider", "toggle"]);
const ROBOT_3D_DEFAULT_TOPIC = "/joint_states";

/** A ROS topic path, or null: without the leading slash it is not one. */
export function asTopic(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") ? value : null;
}

/** The topic a binding's value mapping names, target_topic before topic. */
export function readValueMappingTopic(valueMapping: Record<string, unknown>): string | null {
  return asTopic(valueMapping.target_topic) ?? asTopic(valueMapping.topic);
}

/**
 * The topic a reading widget subscribes to, and what the runtime subscribes: the joint state topic
 * for the robot views (a default stands in), the widget's own topic otherwise, null for a kind that
 * reads nothing.
 */
export function resolveSubscriptionTopic(kind: string, settings: Record<string, unknown>): string | null {
  if (JOINT_STATE_KINDS.has(kind)) {
    return asTopic(settings.jointStateTopic) ?? ROBOT_3D_DEFAULT_TOPIC;
  }
  return READING_KINDS.has(kind) ? asTopic(settings.topic) : null;
}

function resolveReadSource(kind: string, settings: Record<string, unknown>): WidgetDestination {
  const topic = resolveSubscriptionTopic(kind, settings);
  if (JOINT_STATE_KINDS.has(kind)) {
    const modelSettings = kind === "robot-3d" ? ROBOT_MODEL_SETTINGS : [];
    return asTopic(settings.jointStateTopic)
      ? {
          direction: "reads",
          topic,
          source: "input-topic",
          detail: null,
          inertSettings: modelSettings,
        }
      : {
          direction: "reads",
          topic,
          source: "widget-default",
          detail: "The default when no joint state topic is set.",
          inertSettings: modelSettings,
        };
  }

  return topic
    ? {
        direction: "reads",
        topic,
        source: "input-topic",
        detail: null,
        inertSettings: [],
      }
    : {
        direction: "reads",
        topic: null,
        source: "unset",
        detail: "This widget receives nothing until you set a topic.",
        inertSettings: [],
      };
}

function resolvePublishDestination(kind: string, settings: Record<string, unknown>): WidgetDestination | null {
  const runtimeBinding = asRecord(settings.runtime_binding);
  const valueMapping = asRecord(runtimeBinding.value_mapping);
  const adapter = typeof runtimeBinding.adapter === "string" ? runtimeBinding.adapter : "";
  const bindingTopic = readValueMappingTopic(valueMapping);
  const legacy: InertSetting[] = [
    ...(kind === "slider" ? [{ key: "binding", reason: LEGACY_BINDING_INERT_ON_SLIDER }] : []),
    ...(kind === "command-button" ? ACTION_CONTRACT_SETTINGS : []),
    ...(kind === "gesture-pad" ? [{ key: "command", reason: GESTURE_COMMAND_INERT }] : []),
  ];

  // Frame controls change the local composition context. They do not publish
  // a ROS message of their own, so reporting a missing topic is misleading.
  if (adapter === "teleop-frame") {
    return null;
  }

  if (adapter === "parameter") {
    // Not a topic at all: the value goes to the node's own parameter service and takes effect at once.
    const node = typeof valueMapping.node === "string" ? valueMapping.node : "";
    const parameter = typeof valueMapping.parameter === "string" ? valueMapping.parameter : "";
    const reason = "A parameter binding sets a node parameter; it publishes no message.";
    return {
      direction: "publishes",
      topic: node && parameter ? `${node} ${parameter}` : null,
      source: "runtime-binding",
      detail: "Sets this parameter live through the node's parameter service.",
      inertSettings: [
        { key: "topic", reason },
        { key: "messageType", reason },
      ],
    };
  }

  if (adapter === "teleop") {
    // A teleop widget contributes an axis to a twist that several widgets
    // compose together. There is one destination for the whole composed twist,
    // so a per-widget output topic has nothing to address.
    const reason = "Teleop widgets contribute to a shared twist, so this is not used.";
    const inertSettings: InertSetting[] = [...legacy, { key: "topic", reason }, { key: "messageType", reason }];

    if (bindingTopic) {
      return {
        direction: "publishes",
        topic: bindingTopic,
        source: "runtime-binding",
        detail: "One axis of a twist several widgets share, so this widget has no topic of its own.",
        inertSettings,
      };
    }

    return {
      direction: "publishes",
      topic: TELEOP_DEFAULT_TARGET,
      source: "adapter-default",
      detail: "The default for teleop widgets. One axis of a twist several widgets share.",
      inertSettings,
    };
  }

  const bindingTarget = asTopic(runtimeBinding.target);
  const outputTopic = asTopic(settings.topic);
  const resolvedBinding = bindingTopic ?? bindingTarget;

  if (resolvedBinding) {
    return {
      direction: "publishes",
      topic: resolvedBinding,
      source: "runtime-binding",
      detail: "Set by the runtime binding, which takes precedence over Output topic.",
      inertSettings: outputTopic
        ? [...legacy, { key: "topic", reason: "The runtime binding sets the destination, so this is not used." }]
        : legacy,
    };
  }

  if (outputTopic) {
    return {
      direction: "publishes",
      topic: outputTopic,
      source: "output-topic",
      detail: null,
      inertSettings: legacy,
    };
  }

  return {
    direction: "publishes",
    topic: null,
    source: "unset",
    detail: "This widget publishes nothing until you set a destination.",
    inertSettings: legacy,
  };
}

/**
 * Resolve a widget's topic, or null for kinds whose data flow this does not
 * model.
 *
 * Returning null matters: a camera reads a stream source rather than a topic,
 * and a plain button carries no topic at all. Guessing a line for those would
 * reintroduce exactly the confusion this panel exists to remove, so the
 * inspector shows nothing instead.
 */
export function resolveWidgetDestination(
  kind: string,
  settings: Record<string, unknown> | undefined,
): WidgetDestination | null {
  const widgetSettings = asRecord(settings);

  if (JOINT_STATE_KINDS.has(kind) || READING_KINDS.has(kind)) {
    return resolveReadSource(kind, widgetSettings);
  }
  if (PUBLISHING_KINDS.has(kind)) {
    return resolvePublishDestination(kind, widgetSettings);
  }
  return null;
}

/** Whether a settings key is ignored for this widget. */
export function findInertSetting(destination: WidgetDestination | null, key: string): InertSetting | undefined {
  return destination?.inertSettings.find((setting) => setting.key === key);
}

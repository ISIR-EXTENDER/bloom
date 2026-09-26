import type { ApplicationConfig, RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import {
  allowlistAllows,
  asRecord,
  createWidgetActionIntent,
  resolvePublishedMessageType,
  resolveWidgetDestination,
  type WidgetDestination,
} from "@bloom/widgets";
import { resolveCommandRoute } from "../runtime/dispatch-commands";

export type WidgetRoute = {
  destination: WidgetDestination;
  /** The type a plain topic publish sends; null for teleop, parameters, reads, or an unset type. */
  messageType: string | null;
  /** The node:parameter pair a parameter binding sets, else null. */
  parameter: string | null;
  /** The ROS service a service-call preset calls, else null. */
  service: string | null;
  /** True when the widget adds an axis to the composed twist. */
  teleop: boolean;
};

/** The preset a command button's press sends, resolved exactly as the dispatcher resolves it. */
export function resolveWidgetPreset(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
): RuntimeActionPreset | null {
  // A held button holds its own topic, whatever preset it names.
  if (widget.kind !== "command-button" || widget.settings.momentary === true) {
    return null;
  }
  const intent = createWidgetActionIntent(widget, { type: "press" });
  const route = intent.type === "command" ? resolveCommandRoute(intent, presets) : null;
  return route?.kind === "preset" ? route.preset : null;
}

/** Where a widget's press or value really goes, as the dispatcher resolves it. */
export function resolveWidgetRoute(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): WidgetRoute | null {
  // A button naming a screen navigates and sends nothing to the robot.
  if (
    widget.kind === "command-button" &&
    createWidgetActionIntent(widget, { type: "press" }).type === "screen-navigation"
  ) {
    return null;
  }
  const destination = resolveWidgetDestination(widget.kind, widget.settings);
  const preset = resolveWidgetPreset(widget, presets);
  if (preset) {
    const service = preset.kind === "service-call";
    return {
      destination: {
        direction: "publishes",
        detail: service
          ? `Calls this service through the "${preset.name}" preset.`
          : `Sent by the "${preset.name}" preset.`,
        inertSettings: destination?.inertSettings ?? [],
        source: "runtime-binding",
        topic: preset.topic || null,
      },
      messageType: service ? null : preset.message_type || null,
      parameter: null,
      service: service ? preset.topic || null : null,
      teleop: false,
    };
  }
  if (!destination) {
    return null;
  }
  const binding = asRecord(widget.settings.runtime_binding);
  const mapping = asRecord(binding.value_mapping);
  return {
    destination,
    messageType:
      destination.direction === "publishes" ? resolvePublishedMessageType(widget.kind, widget.settings) : null,
    parameter:
      binding.adapter === "parameter" ? `${String(mapping.node ?? "")}:${String(mapping.parameter ?? "")}` : null,
    service: null,
    teleop: binding.adapter === "teleop",
  };
}

/** Plain topic publishes on the app's own screens, each with its type when one is known. */
export function collectPublishRoutes(
  application: ApplicationConfig,
): Array<{ messageType: string | null; topic: string }> {
  return application.screens.flatMap((screen) =>
    screen.widgets.flatMap((widget) => {
      const route = resolveWidgetRoute(widget, application.action_presets);
      const topic = route?.destination.direction === "publishes" ? route.destination.topic : null;
      return route && topic && !route.teleop && !route.parameter && !route.service
        ? [{ messageType: route.messageType, topic }]
        : [];
    }),
  );
}

/**
 * The publish and type lists with every preset's and on-screen publisher's entry added. An empty list allows all,
 * so it stays empty unless the merged one still admits every publisher already on a screen.
 */
export function syncPublishPolicy(
  application: ApplicationConfig,
): Pick<
  ApplicationConfig["runtime_policy"],
  "allowed_message_types" | "allowed_publish_topics" | "allowed_service_calls"
> {
  const policy = application.runtime_policy;
  const routes = collectPublishRoutes(application);
  // A service-call preset names a service, never a publish topic or message type.
  const topicPresets = application.action_presets.filter((preset) => preset.kind !== "service-call");
  const merge = (
    current: readonly string[],
    added: ReadonlyArray<string | null>,
    routeValue: (route: (typeof routes)[number]) => string | null,
  ) => {
    const merged = [...new Set([...current, ...added].map((value) => (value ?? "").trim()).filter(Boolean))];
    const admitsScreens = routes.every((route) => {
      const value = routeValue(route);
      return value !== null && allowlistAllows(merged, value);
    });
    return current.length === 0 && !admitsScreens ? [] : merged;
  };
  return {
    allowed_message_types: merge(
      policy.allowed_message_types,
      [...topicPresets.map((preset) => preset.message_type), ...routes.map((route) => route.messageType)],
      (route) => route.messageType,
    ),
    allowed_publish_topics: merge(
      policy.allowed_publish_topics,
      [...topicPresets.map((preset) => preset.topic), ...routes.map((route) => route.topic)],
      (route) => route.topic,
    ),
    // An app that names no service calls none, so each preset's service is added outright.
    allowed_service_calls: [
      ...new Set(
        [
          ...(policy.allowed_service_calls ?? []),
          ...application.action_presets
            .filter((preset) => preset.kind === "service-call")
            .map((preset) => preset.topic),
        ]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
  };
}

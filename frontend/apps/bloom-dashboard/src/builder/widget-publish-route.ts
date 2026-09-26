import type { ApplicationConfig, RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import {
  allowlistAllows,
  asRecord,
  resolvePublishedMessageType,
  resolveWidgetDestination,
  type WidgetDestination,
} from "@bloom/widgets";

export type WidgetRoute = {
  destination: WidgetDestination;
  /** The type a plain topic publish sends; null for teleop, parameters, reads, or an unset type. */
  messageType: string | null;
  /** The node:parameter pair a parameter binding sets, else null. */
  parameter: string | null;
  /** True when the widget adds an axis to the composed twist. */
  teleop: boolean;
};

/** Where a widget's press or value really goes, a picked app preset first, as the dispatcher resolves it. */
export function resolveWidgetRoute(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): WidgetRoute | null {
  const destination = resolveWidgetDestination(widget.kind, widget.settings);
  if (!destination) {
    return null;
  }
  const presetId = typeof widget.settings.presetId === "string" ? widget.settings.presetId.trim() : "";
  const preset =
    widget.kind === "command-button" && presetId ? presets.find((candidate) => candidate.id === presetId) : undefined;
  if (preset) {
    return {
      destination: {
        ...destination,
        detail: `Sent by the "${preset.name}" preset.`,
        source: "runtime-binding",
        topic: preset.topic || null,
      },
      messageType: preset.message_type || null,
      parameter: null,
      teleop: false,
    };
  }
  const binding = asRecord(widget.settings.runtime_binding);
  const mapping = asRecord(binding.value_mapping);
  return {
    destination,
    messageType:
      destination.direction === "publishes" ? resolvePublishedMessageType(widget.kind, widget.settings) : null,
    parameter:
      binding.adapter === "parameter" ? `${String(mapping.node ?? "")}:${String(mapping.parameter ?? "")}` : null,
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
      return route && topic && !route.teleop && !route.parameter ? [{ messageType: route.messageType, topic }] : [];
    }),
  );
}

/**
 * The publish and type lists with every preset's and on-screen publisher's entry added. An empty list allows all,
 * so it stays empty unless the merged one still admits every publisher already on a screen.
 */
export function syncPublishPolicy(
  application: ApplicationConfig,
): Pick<ApplicationConfig["runtime_policy"], "allowed_message_types" | "allowed_publish_topics"> {
  const policy = application.runtime_policy;
  const routes = collectPublishRoutes(application);
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
      [...application.action_presets.map((preset) => preset.message_type), ...routes.map((route) => route.messageType)],
      (route) => route.messageType,
    ),
    allowed_publish_topics: merge(
      policy.allowed_publish_topics,
      [...application.action_presets.map((preset) => preset.topic), ...routes.map((route) => route.topic)],
      (route) => route.topic,
    ),
  };
}

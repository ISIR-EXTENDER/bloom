import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import {
  appendTopicEchoMessage,
  appendTopicPlotSample,
  getNumberSetting,
  readOptionalString,
  resolveSubscriptionTopic,
} from "@bloom/widgets";
import { appendSeriesSample, createSeriesSubscriptionRequests, isSeriesWidget } from "./plot-series-data";
import type { RuntimeTopicSampleMessage, RuntimeTopicSubscriptionRequest } from "./runtime-action-dispatcher";
import type { RuntimeVector3 } from "./runtime-protocol";

export function createRuntimeTopicSubscriptionRequests(screen: ScreenConfig): RuntimeTopicSubscriptionRequest[] {
  const widgetRequests = screen.widgets.flatMap((widget): RuntimeTopicSubscriptionRequest[] => {
    const topic = resolveWidgetRuntimeTopic(widget);
    if (!topic?.startsWith("/")) {
      return [];
    }

    return [
      {
        type: "subscribe_topic",
        topic,
        message_type: resolveWidgetRuntimeMessageType(widget),
        field_path: resolveWidgetRuntimeFieldPath(widget),
        widget_id: widget.id,
      },
    ];
  });
  const viewRequests = screen.widgets.flatMap((widget): RuntimeTopicSubscriptionRequest[] =>
    resolveRobotViewTopics(widget).map((extra) => ({
      type: "subscribe_topic",
      topic: extra.topic,
      message_type: extra.messageType,
      field_path: "",
      widget_id: widget.id,
    })),
  );
  return [...widgetRequests, ...viewRequests, ...createSeriesSubscriptionRequests(screen, widgetRequests)];
}

/** What a 3D robot view reads beside its joint states, each kept under its own field of the snapshot. */
const ROBOT_VIEW_TOPICS = [
  { field: "markers", messageType: "visualization_msgs/msg/MarkerArray", setting: "markerTopic" },
  { field: "target", messageType: "sensor_msgs/msg/JointState", setting: "targetJointTopic" },
  { field: "pose", messageType: "geometry_msgs/msg/PoseStamped", setting: "poseTopic" },
] as const;

type RobotViewTopic = { field: (typeof ROBOT_VIEW_TOPICS)[number]["field"]; messageType: string; topic: string };

/** The extra topics a 3D robot view names, when it names them. */
export function resolveRobotViewTopics(widget: WidgetConfig): RobotViewTopic[] {
  if (widget.kind !== "robot-3d") {
    return [];
  }
  return ROBOT_VIEW_TOPICS.flatMap((extra) => {
    const topic = readOptionalString(widget.settings[extra.setting]);
    return topic?.startsWith("/") ? [{ field: extra.field, messageType: extra.messageType, topic }] : [];
  });
}

/** The twist the runtime is sending, on every 3D robot view of the screen, so it can draw the commanded motion. */
export function withRobotCommand(
  data: Readonly<Record<string, WidgetDataSnapshot>>,
  screen: ScreenConfig,
  command: { angular: RuntimeVector3; frame_id?: string; linear: RuntimeVector3 } | null,
): Record<string, WidgetDataSnapshot> {
  const views = screen.widgets.filter((widget) => widget.kind === "robot-3d");
  if (views.length === 0) {
    return { ...data };
  }
  const next = { ...data };
  for (const widget of views) {
    const current = data[widget.id];
    const base =
      current?.type === "robot-3d"
        ? current
        : {
            receivedAt: "",
            topic: resolveWidgetRuntimeTopic(widget) ?? "",
            type: "robot-3d" as const,
            value: undefined,
          };
    next[widget.id] = {
      ...base,
      command: command ? { angular: command.angular, frameId: command.frame_id, linear: command.linear } : undefined,
    };
  }
  return next;
}

export function appendRuntimeTopicSample(
  currentData: Readonly<Record<string, WidgetDataSnapshot>>,
  screen: ScreenConfig,
  sample: RuntimeTopicSampleMessage,
): Record<string, WidgetDataSnapshot> {
  let nextData: Record<string, WidgetDataSnapshot> | null = null;
  const topicMessage = {
    receivedAt: sample.payload.received_at,
    topic: sample.payload.topic,
    value: sample.payload.value,
  };

  for (const widget of screen.widgets) {
    if (isSeriesWidget(widget)) {
      const series = appendSeriesSample(currentData[widget.id], widget, topicMessage);
      if (series) {
        nextData = nextData ?? { ...currentData };
        nextData[widget.id] = series;
      }
      continue;
    }
    const viewTopic =
      widget.kind === "robot-3d"
        ? resolveRobotViewTopics(widget).find((extra) => extra.topic === sample.payload.topic)
        : undefined;
    if (viewTopic && resolveWidgetRuntimeTopic(widget) !== sample.payload.topic) {
      const current = currentData[widget.id];
      nextData = nextData ?? { ...currentData };
      nextData[widget.id] = {
        ...(current?.type === "robot-3d"
          ? current
          : {
              receivedAt: topicMessage.receivedAt,
              topic: resolveWidgetRuntimeTopic(widget) ?? "",
              type: "robot-3d" as const,
              value: undefined,
            }),
        [viewTopic.field]: topicMessage.value,
      };
      continue;
    }
    if (resolveWidgetRuntimeTopic(widget) !== sample.payload.topic) {
      continue;
    }

    if (widget.kind === "topic-echo") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentMessages = currentWidgetData?.type === "topic-echo" ? currentWidgetData.messages : [];
      nextData[widget.id] = {
        type: "topic-echo",
        messages: appendTopicEchoMessage(currentMessages, topicMessage, {
          fieldPath: readOptionalString(widget.settings.fieldPath) ?? "",
          maxMessages: getNumberSetting(widget.settings, "maxMessages", 100),
        }),
      };
    }

    // Tables read only the newest message.
    if (widget.kind === "joint-table" || widget.kind === "jacobian") {
      nextData = nextData ?? { ...currentData };
      nextData[widget.id] = { type: "topic-echo", messages: [topicMessage] };
    }

    if (widget.kind === "event-log") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentMessages = currentWidgetData?.type === "event-log" ? currentWidgetData.messages : [];
      nextData[widget.id] = {
        type: "event-log",
        messages: appendTopicEchoMessage(currentMessages, topicMessage, {
          fieldPath: readOptionalString(widget.settings.fieldPath) ?? "",
          maxMessages: getNumberSetting(widget.settings, "maxEntries", 20),
        }),
      };
    }

    if (widget.kind === "topic-plot") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentSamples = currentWidgetData?.type === "topic-plot" ? currentWidgetData.samples : [];
      nextData[widget.id] = {
        type: "topic-plot",
        samples: appendTopicPlotSample(currentSamples, topicMessage, {
          fieldPath: readOptionalString(widget.settings.fieldPath) ?? "data",
          historySeconds: getNumberSetting(widget.settings, "historySeconds", 30),
          maxSamples: getNumberSetting(widget.settings, "maxSamples", 500),
        }),
      };
    }

    if (widget.kind === "gauge") {
      const samples = appendTopicPlotSample([], topicMessage, {
        fieldPath: readOptionalString(widget.settings.fieldPath) ?? "data",
        historySeconds: 1,
        maxSamples: 1,
      });
      const latestSample = samples.at(-1);
      if (!latestSample) {
        continue;
      }

      nextData = nextData ?? { ...currentData };
      nextData[widget.id] = {
        receivedAt: topicMessage.receivedAt,
        topic: topicMessage.topic,
        type: "gauge",
        value: latestSample.value,
      };
    }

    if (widget.kind === "plot") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentSamples = currentWidgetData?.type === "plot" ? currentWidgetData.samples : [];
      nextData[widget.id] = {
        type: "plot",
        samples: appendTopicPlotSample(currentSamples, topicMessage, {
          fieldPath: readOptionalString(widget.settings.fieldPath) ?? "data",
          historySeconds: getNumberSetting(widget.settings, "historySeconds", 30),
          maxSamples: getNumberSetting(widget.settings, "maxSamples", 500),
        }),
      };
    }

    if (widget.kind === "robot-3d") {
      const current = currentData[widget.id];
      nextData = nextData ?? { ...currentData };
      nextData[widget.id] = {
        ...(current?.type === "robot-3d" ? current : {}),
        receivedAt: topicMessage.receivedAt,
        topic: topicMessage.topic,
        type: "robot-3d",
        value: topicMessage.value,
      };
    }

    if (widget.kind === "position-library") {
      const joints = readJointStateSample(topicMessage.value, readJointNamesSetting(widget.settings));
      if (joints) {
        nextData = nextData ?? { ...currentData };
        const existing = currentData[widget.id];
        nextData[widget.id] = {
          ...(existing?.type === "position-library" ? existing : { type: "position-library", saved: [] }),
          type: "position-library",
          joints: { ...joints, receivedAt: topicMessage.receivedAt },
        };
      }
    }
  }

  return nextData ?? { ...currentData };
}

/** The builder's destination panel is tested against this, the real subscription rule (widget-destination.ts). */
export function resolveWidgetRuntimeTopic(widget: WidgetConfig): string | undefined {
  return resolveSubscriptionTopic(widget.kind, widget.settings) ?? undefined;
}

function resolveWidgetRuntimeMessageType(widget: WidgetConfig): string {
  if (widget.kind === "robot-3d" || widget.kind === "position-library") {
    return "sensor_msgs/msg/JointState";
  }
  return readOptionalString(widget.settings.messageType) ?? "";
}

function resolveWidgetRuntimeFieldPath(widget: WidgetConfig): string {
  if (widget.kind === "gauge" || widget.kind === "plot" || widget.kind === "topic-plot") {
    return readOptionalString(widget.settings.fieldPath) ?? "data";
  }
  return readOptionalString(widget.settings.fieldPath) ?? "";
}

function readJointNamesSetting(settings: Record<string, unknown>): string[] {
  const raw = settings.jointNames;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

function readJointStateSample(value: unknown, orderedNames: string[]): { names: string[]; positions: number[] } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const names = Array.isArray(record.name) ? record.name.map(String) : [];
  const positions = Array.isArray(record.position) ? record.position.map(Number) : [];
  if (names.length === 0 || names.length !== positions.length) {
    return null;
  }
  if (orderedNames.length === 0) {
    return { names, positions };
  }
  // Filter and order to the configured joints; a sample missing one is
  // incomplete and must not be capturable.
  const lookup = new Map(names.map((name, index) => [name, positions[index] as number]));
  const ordered: number[] = [];
  for (const name of orderedNames) {
    const position = lookup.get(name);
    if (position === undefined || !Number.isFinite(position)) {
      return null;
    }
    ordered.push(position);
  }
  return { names: orderedNames, positions: ordered };
}

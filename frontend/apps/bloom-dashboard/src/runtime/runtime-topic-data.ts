import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import {
  appendTopicEchoMessage,
  appendTopicPlotSample,
  asRecord,
  getNumberSetting,
  readConfidences,
  readNumber,
  readOptionalString,
  resolveSubscriptionTopic,
  type SavedHandPose,
  sameConfidences,
} from "@bloom/widgets";
import { appendSeriesSample, createSeriesSubscriptionRequests, isSeriesWidget, seriesTopics } from "./plot-series-data";
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
    [...resolveRobotViewTopics(widget), ...resolveHandPoseTopics(widget)].map((extra) => ({
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
  { field: "goals", messageType: "geometry_msgs/msg/PoseArray", setting: "goalsTopic" },
  { field: "softGoal", messageType: "geometry_msgs/msg/PoseStamped", setting: "softGoalTopic" },
] as const;

/** The manager sends the soft goal at 100 Hz; a move under a millimetre and a hundredth of a quaternion is no move. */
function samePoseSample(a: unknown, b: unknown): boolean {
  const poseA = asRecord(asRecord(a).pose);
  const poseB = asRecord(asRecord(b).pose);
  if (!("position" in poseA) || !("position" in poseB)) {
    return false;
  }
  const near = (part: string, axes: string[], tolerance: number) =>
    axes.every(
      (axis) =>
        Math.abs(readNumber(asRecord(poseA[part])[axis], 0) - readNumber(asRecord(poseB[part])[axis], 0)) < tolerance,
    );
  return (
    asRecord(asRecord(a).header).frame_id === asRecord(asRecord(b).header).frame_id &&
    near("position", ["x", "y", "z"], 1e-3) &&
    near("orientation", ["x", "y", "z", "w"], 1e-2)
  );
}

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

const HAND_POSE_TYPE = "geometry_msgs/msg/PoseStamped";

/** A position library's hand pose topic, saved beside the joints so Go to can send the arm back. */
function resolveHandPoseTopics(widget: WidgetConfig): { messageType: string; topic: string }[] {
  if (widget.kind !== "position-library") {
    return [];
  }
  const topic = readOptionalString(widget.settings.eePoseTopic);
  return topic?.startsWith("/") && topic !== resolveWidgetRuntimeTopic(widget)
    ? [{ messageType: HAND_POSE_TYPE, topic }]
    : [];
}

/** A PoseStamped sample as a saved hand pose, or null when it is not one. */
function readHandPose(value: unknown): SavedHandPose | null {
  const record = asRecord(value);
  const pose = asRecord(record.pose);
  const position = asRecord(pose.position);
  const orientation = asRecord(pose.orientation);
  const numbers = [position.x, position.y, position.z, orientation.x, orientation.y, orientation.z, orientation.w];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) {
    return null;
  }
  const [x, y, z, qx, qy, qz, qw] = numbers as number[];
  const frameId = asRecord(record.header).frame_id;
  return {
    frameId: typeof frameId === "string" ? frameId : "",
    position: [x as number, y as number, z as number],
    orientation: [qx as number, qy as number, qz as number, qw as number],
  };
}

/**
 * The pose an armed Go to would send, on every 3D robot view of the screen, drawn as the target triad before the
 * second press sends it. Null clears it.
 */
export function withPosePreview(
  data: Readonly<Record<string, WidgetDataSnapshot>>,
  screen: ScreenConfig,
  pose: { frame_id: string; orientation: readonly number[]; position: readonly number[] } | null,
): Record<string, WidgetDataSnapshot> {
  const next = { ...data };
  for (const widget of screen.widgets) {
    const current = next[widget.id];
    if (widget.kind !== "robot-3d" || current?.type !== "robot-3d") {
      continue;
    }
    const [x, y, z] = pose?.position ?? [];
    const [qx, qy, qz, qw] = pose?.orientation ?? [];
    next[widget.id] = {
      ...current,
      previewPose: pose
        ? {
            header: { frame_id: pose.frame_id },
            pose: { position: { x, y, z }, orientation: { x: qx, y: qy, z: qz, w: qw } },
          }
        : undefined,
    };
  }
  return next;
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

const NO_WIDGETS: readonly WidgetConfig[] = [];
const screenTopicIndexes = new WeakMap<ScreenConfig, Map<string, WidgetConfig[]>>();

/**
 * Which widgets can answer a topic, built once per screen. A sample used to walk every widget on the screen
 * and re-resolve its topic from its settings; at sixty samples a second on a twenty-widget screen that was the
 * runtime's warmest loop.
 */
function widgetsForTopic(screen: ScreenConfig, topic: string): readonly WidgetConfig[] {
  let index = screenTopicIndexes.get(screen);
  if (!index) {
    index = new Map<string, WidgetConfig[]>();
    for (const widget of screen.widgets) {
      for (const widgetTopic of widgetTopics(widget)) {
        const known = index.get(widgetTopic);
        if (known) {
          known.push(widget);
        } else {
          index.set(widgetTopic, [widget]);
        }
      }
    }
    screenTopicIndexes.set(screen, index);
  }
  return index.get(topic) ?? NO_WIDGETS;
}

/** Every topic one widget answers: its own, its series', and a 3D view's markers, target and pose. */
function widgetTopics(widget: WidgetConfig): string[] {
  if (isSeriesWidget(widget)) {
    return seriesTopics(widget);
  }
  const own = resolveWidgetRuntimeTopic(widget);
  return [
    ...(own ? [own] : []),
    ...resolveRobotViewTopics(widget).map((extra) => extra.topic),
    ...resolveHandPoseTopics(widget).map((extra) => extra.topic),
  ];
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

  for (const widget of widgetsForTopic(screen, sample.payload.topic)) {
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
      const held = current?.type === "robot-3d" ? current[viewTopic.field] : undefined;
      if (viewTopic.field === "softGoal" && samePoseSample(held, topicMessage.value)) {
        continue;
      }
      // Each drawn extra keeps its own arrival time: a soft goal that stopped must not stay drawn as live.
      const arrivedAt =
        viewTopic.field === "goals" || viewTopic.field === "softGoal"
          ? { [`${viewTopic.field}ReceivedAt`]: topicMessage.receivedAt }
          : {};
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
        ...arrivedAt,
      };
      continue;
    }
    if (widget.kind === "position-library" && resolveWidgetRuntimeTopic(widget) !== sample.payload.topic) {
      const hand = readHandPose(topicMessage.value);
      if (hand) {
        const existing = currentData[widget.id];
        nextData = nextData ?? { ...currentData };
        nextData[widget.id] = {
          ...(existing?.type === "position-library" ? existing : { type: "position-library", saved: [] }),
          type: "position-library",
          eePose: { ...hand, receivedAt: topicMessage.receivedAt },
        };
      }
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

    // The manager sends confidences at 100 Hz; the bars redraw only when a goal moved by a hundredth, so the last
    // sample always shows. A sample nothing can be read from never replaces a readable one.
    if (widget.kind === "confidence-bars") {
      const current = currentData[widget.id];
      const held = current?.type === "topic-echo" ? current.messages.at(-1) : undefined;
      const heldGoals = held ? readConfidences(held.value) : [];
      const goals = readConfidences(topicMessage.value);
      const unreadable = goals.length === 0 && heldGoals.length > 0;
      const fresh = held !== undefined && Date.parse(topicMessage.receivedAt) - Date.parse(held.receivedAt) < 1000;
      if (!unreadable && (!held || !fresh || !sameConfidences(heldGoals, goals))) {
        nextData = nextData ?? { ...currentData };
        nextData[widget.id] = { type: "topic-echo", messages: [topicMessage] };
      }
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

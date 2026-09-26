import type { MotorAccessibilityPreset, RuntimeLanguage, WidgetKind } from "@bloom/api-client";
import type {
  PlotSeriesConfig,
  PlotSeriesSample,
  TopicMessage,
  TopicPlotSample,
  WidgetActionIntent,
  WidgetRenderDescriptor,
} from "@bloom/widgets";
import type { ComponentType, ReactNode } from "react";

export type SavedPositionEntry = {
  name: string;
  jointNames: readonly string[];
  positions: readonly number[];
  description?: string;
};

export type PlotSeriesSnapshot = PlotSeriesConfig & { samples: readonly PlotSeriesSample[] };

export type WidgetDataSnapshot =
  | {
      type: "camera-frame";
      topic: string;
      /** An object URL for the newest frame, absent until the first one arrives. */
      frameUrl?: string;
      /** False when the backend has no ROS node, so "starting up" and "never will" read differently. */
      connected: boolean;
      detail?: string;
      /** When the newest frame arrived (ms since epoch); a frame that stops changing must not look live. */
      receivedAt?: number;
    }
  | {
      messages: readonly TopicMessage[];
      type: "event-log";
    }
  | {
      type: "position-library";
      joints?: { names: readonly string[]; positions: readonly number[]; receivedAt: string };
      saved: readonly SavedPositionEntry[];
      exportYaml?: string;
      notice?: string;
      busy?: boolean;
    }
  | {
      receivedAt: string;
      topic: string;
      type: "gauge";
      value: number;
    }
  | {
      receivedAt: string;
      topic: string;
      type: "robot-3d";
      value: unknown;
      /** The newest MarkerArray on the widget's marker topic, when it names one. */
      markers?: unknown;
      /** The newest JointState on the widget's joint target topic: where a target is sending the robot. */
      target?: unknown;
      /** The newest PoseStamped on the widget's pose topic. */
      pose?: unknown;
      /** The twist the runtime is sending right now, absent when it is not driving. */
      command?: CommandedTwist;
    }
  | {
      samples: readonly TopicPlotSample[];
      type: "plot";
    }
  | {
      /** A plot board's or value strip's series; a picker receives its board's. */
      series: readonly PlotSeriesSnapshot[];
      type: "plot-series";
    }
  | {
      messages: readonly TopicMessage[];
      type: "topic-echo";
    }
  | {
      samples: readonly TopicPlotSample[];
      type: "topic-plot";
    };

export type WidgetActionOutcome = {
  accepted: boolean;
  detail?: string;
};

export type WidgetActionIntentHandler = (
  intent: WidgetActionIntent,
) => WidgetActionOutcome | undefined | Promise<WidgetActionOutcome | undefined>;

export type WidgetControlState = {
  /** A value read back from the robot side (a live node parameter); the control shows it. */
  value?: boolean | number;
  disabled?: boolean;
  disabledReason?: string;
  /** The backend cannot serve this widget; keep it visible, inert, and explained. */
  unavailable?: boolean;
  /** The frame the next operator twist is stamped with, for an echo of those twists. */
  commandFrameId?: string;
  /** This robot will never offer it (design §09): dashed, not dimmed like a control that is only "not now". */
  unsupported?: boolean;
  /**
   * Whether this control is the one currently selected among a mutually
   * exclusive set, such as the manager's mode.
   *
   * The manager publishes no mode feedback, so this only ever reflects what
   * this session last requested. Renderers must not present it as confirmation
   * that the robot is in that mode.
   */
  selection?: "selected" | "unselected";
  toggleState?: "off" | "on";
};

/** A twist the runtime is sending: unit scale, linear in the base frame, angular in the named frame. */
export type CommandedTwist = {
  angular: { x: number; y: number; z: number };
  frameId?: string;
  linear: { x: number; y: number; z: number };
};

/** Where the 3D robot view gets the running robot's description and the meshes it names. */
export type RobotModelSource = {
  /** The URDF text, or null when the API has none to give. */
  load: () => Promise<string | null>;
  /** The bytes behind a `package://<package>/<path>` URI, or null. */
  asset: (uri: string) => Promise<ArrayBuffer | null>;
};

/** Per-profile input conditioning, applied before a widget's own settings. */
export type SignalConditioning = {
  /** Overrides the widget's dead zone when above zero. */
  deadzone?: number;
  /** Ignores a repeat activation of the same control inside this window. */
  repeatGuardMs?: number;
};

export type WidgetRendererProps = {
  conditioning?: SignalConditioning;
  controlState?: WidgetControlState;
  data?: WidgetDataSnapshot;
  descriptor: Extract<WidgetRenderDescriptor, { status: "resolved" }>;
  /** The profile's language; the descriptor's operator words already follow it. */
  language?: RuntimeLanguage;
  /** The operator profile's motor preset; renderers adapt their input model. */
  motorPreset?: MotorAccessibilityPreset;
  /**
   * Advances whenever the runtime neutralizes teleop (STOP, lost control, a
   * hidden tab). Held controls return to rest; the runtime already sent zero.
   */
  neutralRevision?: number;
  onActionIntent?: WidgetActionIntentHandler;
  robotModel?: RobotModelSource;
};

export type UnknownWidgetRendererProps = {
  descriptor: Extract<WidgetRenderDescriptor, { status: "unknown" }>;
};

export type WidgetRenderer = (props: WidgetRendererProps) => ReactNode;

export type UnknownWidgetRenderer = (props: UnknownWidgetRendererProps) => ReactNode;

export type WidgetRendererRegistration = {
  kind: WidgetKind;
  render: WidgetRenderer;
};

/** Registered renderers are memoized, so the map holds components rather than plain functions. */
export type WidgetRendererRegistry = ReadonlyMap<WidgetKind, ComponentType<WidgetRendererProps>>;

export type ScreenRendererOptions = {
  conditioning?: SignalConditioning;
  controlStateByWidgetId?: Readonly<Record<string, WidgetControlState>>;
  dataByWidgetId?: Readonly<Record<string, WidgetDataSnapshot>>;
  language?: RuntimeLanguage;
  motorPreset?: MotorAccessibilityPreset;
  neutralRevision?: number;
  onActionIntent?: WidgetActionIntentHandler;
  renderUnknown?: UnknownWidgetRenderer;
  registry?: WidgetRendererRegistry;
  robotModel?: RobotModelSource;
};

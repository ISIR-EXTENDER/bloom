import type { MotorAccessibilityPreset, WidgetKind } from "@bloom/api-client";
import type { TopicMessage, TopicPlotSample, WidgetActionIntent, WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";

export type SavedPositionEntry = {
  name: string;
  jointNames: readonly string[];
  positions: readonly number[];
  description?: string;
};

export type WidgetDataSnapshot =
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
    }
  | {
      samples: readonly TopicPlotSample[];
      type: "plot";
    }
  | {
      messages: readonly TopicMessage[];
      type: "topic-echo";
    }
  | {
      samples: readonly TopicPlotSample[];
      type: "topic-plot";
    };

export type WidgetActionIntentHandler = (intent: WidgetActionIntent) => void;

export type WidgetControlState = {
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

export type WidgetRendererProps = {
  controlState?: WidgetControlState;
  data?: WidgetDataSnapshot;
  descriptor: Extract<WidgetRenderDescriptor, { status: "resolved" }>;
  /** The operator profile's motor preset; renderers adapt their input model. */
  motorPreset?: MotorAccessibilityPreset;
  onActionIntent?: WidgetActionIntentHandler;
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

export type WidgetRendererRegistry = ReadonlyMap<WidgetKind, WidgetRenderer>;

export type ScreenRendererOptions = {
  controlStateByWidgetId?: Readonly<Record<string, WidgetControlState>>;
  dataByWidgetId?: Readonly<Record<string, WidgetDataSnapshot>>;
  motorPreset?: MotorAccessibilityPreset;
  onActionIntent?: WidgetActionIntentHandler;
  renderUnknown?: UnknownWidgetRenderer;
  registry?: WidgetRendererRegistry;
};

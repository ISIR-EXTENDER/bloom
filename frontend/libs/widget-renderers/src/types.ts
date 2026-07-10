import type { WidgetKind } from "@bloom/api-client";
import type { TopicMessage, TopicPlotSample, WidgetActionIntent, WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";

export type WidgetDataSnapshot =
  | {
      messages: readonly TopicMessage[];
      type: "event-log";
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

export type WidgetRendererProps = {
  data?: WidgetDataSnapshot;
  descriptor: Extract<WidgetRenderDescriptor, { status: "resolved" }>;
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
  dataByWidgetId?: Readonly<Record<string, WidgetDataSnapshot>>;
  onActionIntent?: WidgetActionIntentHandler;
  renderUnknown?: UnknownWidgetRenderer;
  registry?: WidgetRendererRegistry;
};

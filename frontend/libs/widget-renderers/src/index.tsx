import type { WidgetKind } from "@bloom/api-client";
import {
  createWidgetActionIntent,
  formatTopicEchoValue,
  type TopicMessage,
  type TopicPlotSample,
  type WidgetActionIntent,
  type WidgetRenderContext,
  type WidgetRenderDescriptor,
} from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { type ReactNode, useState } from "react";
import { type JoystickLabels, JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";

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

export type WidgetActionIntentHandler = (intent: WidgetActionIntent) => void;

export type WidgetDataSnapshot =
  | {
      messages: readonly TopicMessage[];
      type: "topic-echo";
    }
  | {
      samples: readonly TopicPlotSample[];
      type: "topic-plot";
    };

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

const DEFAULT_WIDGET_RENDERERS: readonly WidgetRendererRegistration[] = [
  { kind: "button", render: CommandLikeWidget },
  { kind: "command-button", render: CommandLikeWidget },
  { kind: "label", render: LabelWidget },
  { kind: "toggle", render: ToggleWidget },
  { kind: "slider", render: SliderWidget },
  { kind: "joystick", render: JoystickWidget },
  { kind: "camera", render: PlaceholderWidget },
  { kind: "gauge", render: PlaceholderWidget },
  { kind: "plot", render: PlaceholderWidget },
  { kind: "topic-echo", render: TopicDebugWidget },
  { kind: "topic-plot", render: TopicDebugWidget },
  { kind: "unknown", render: PlaceholderWidget },
];

export function createWidgetRendererRegistry(
  registrations: readonly WidgetRendererRegistration[] = DEFAULT_WIDGET_RENDERERS,
): WidgetRendererRegistry {
  const registry = new Map<WidgetKind, WidgetRenderer>();

  for (const registration of registrations) {
    if (registry.has(registration.kind)) {
      throw new Error(`Duplicate widget renderer for kind "${registration.kind}".`);
    }
    registry.set(registration.kind, registration.render);
  }

  return registry;
}

export function renderWidgetDescriptor(
  descriptor: WidgetRenderDescriptor,
  options: ScreenRendererOptions = {},
): ReactNode {
  if (descriptor.status === "unknown") {
    const renderUnknown = options.renderUnknown ?? UnknownWidget;
    return renderUnknown({ descriptor });
  }

  const registry = options.registry ?? createWidgetRendererRegistry();
  const renderer = registry.get(descriptor.definition.kind);
  if (!renderer) {
    return (
      <UnknownWidget
        descriptor={{
          status: "unknown",
          widget: descriptor.widget,
          context: descriptor.context,
          reason: `No React renderer registered for kind "${descriptor.definition.kind}".`,
        }}
      />
    );
  }

  const Renderer = renderer;
  return (
    <Renderer
      data={options.dataByWidgetId?.[descriptor.widget.id]}
      descriptor={descriptor}
      onActionIntent={options.onActionIntent}
    />
  );
}

export function renderScreenWidgets(
  descriptors: readonly WidgetRenderDescriptor[],
  options: ScreenRendererOptions = {},
): ReactNode[] {
  return descriptors.map((descriptor) => (
    <WidgetFrame context={descriptor.context} descriptor={descriptor} key={descriptor.widget.id}>
      {renderWidgetDescriptor(descriptor, options)}
    </WidgetFrame>
  ));
}

function WidgetFrame({
  children,
  descriptor,
}: {
  children: ReactNode;
  context: WidgetRenderContext;
  descriptor: WidgetRenderDescriptor;
}) {
  const { widget } = descriptor;

  return (
    <article
      className={`widget-preview-card widget-preview-${descriptor.status}`}
      data-screen-id={descriptor.context.screenId}
      data-widget-kind={widget.kind}
      style={{
        left: `${widget.layout.x}px`,
        top: `${widget.layout.y}px`,
        width: `${widget.layout.width}px`,
        height: `${widget.layout.height}px`,
      }}
    >
      {children}
    </article>
  );
}

function CommandLikeWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const handlePress = () => {
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "press" }));
  };

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <button className="bloom-command-button" onClick={handlePress} type="button">
        Send
      </button>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

function LabelWidget({ descriptor }: WidgetRendererProps) {
  const text = getStringSetting(descriptor.widget.settings, "text", descriptor.widget.title);

  return (
    <>
      <strong>{text}</strong>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

function ToggleWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const [isOn, setIsOn] = useState(getBooleanSetting(descriptor.widget.settings, "initialValue", false));

  const handleToggle = () => {
    const nextState = isOn ? "off" : "on";
    setIsOn(nextState === "on");
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" }));
  };

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <button
        aria-pressed={isOn}
        className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
        onClick={handleToggle}
        type="button"
      >
        {isOn ? "ON" : "OFF"}
      </button>
      <span>{topic || descriptor.definition.displayName}</span>
    </>
  );
}

function SliderWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", -1);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  const step = getNumberSetting(descriptor.widget.settings, "step", 0.01);
  const direction = getStringSetting(descriptor.widget.settings, "direction", "vertical");
  const defaultValue = clamp(0, min, max);

  const handleValueChange = (values: number[]) => {
    const value = values[0];
    if (value === undefined) {
      return;
    }
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-value", value }));
  };

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <SliderPrimitive.Root
        className={`bloom-slider bloom-slider-${direction === "horizontal" ? "horizontal" : "vertical"}`}
        data-orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        defaultValue={[defaultValue]}
        max={max}
        min={min}
        onValueChange={handleValueChange}
        orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        step={step}
      >
        <SliderPrimitive.Track className="bloom-slider-track">
          <SliderPrimitive.Range className="bloom-slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={descriptor.widget.title} className="bloom-slider-thumb" />
      </SliderPrimitive.Root>
      <span>
        {descriptor.definition.displayName} {min} → {max}
      </span>
    </>
  );
}

function JoystickWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const binding = getStringSetting(descriptor.widget.settings, "binding", "input");
  const deadzone = getNumberSetting(descriptor.widget.settings, "deadzone", 0.1);
  const labels = getJoystickLabels(descriptor.widget.settings);
  const color = getStringSetting(descriptor.widget.settings, "color", "#7fa95f");
  const size = Math.max(80, Math.min(descriptor.widget.layout.width, descriptor.widget.layout.height) - 48);

  const handleVectorChange = (value: JoystickVector) => {
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-vector", value }));
  };

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <JoystickPrimitive
        color={color}
        deadzone={deadzone}
        labels={labels}
        onVectorChange={handleVectorChange}
        size={size}
        title={descriptor.widget.title}
      />
      <span>
        {descriptor.definition.displayName} · {binding}
      </span>
    </>
  );
}

function PlaceholderWidget({ descriptor }: WidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

function TopicDebugWidget({ data, descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "No topic configured");
  const fieldPath = getStringSetting(descriptor.widget.settings, "fieldPath", "");

  if (descriptor.widget.kind === "topic-echo") {
    const messages = data?.type === "topic-echo" ? data.messages : [];
    return (
      <>
        <strong>{descriptor.widget.title}</strong>
        <span>{topic}</span>
        <pre className="bloom-topic-echo">
          {messages.length > 0
            ? messages.map((message) => formatTopicEchoValue(message.value, true)).join("\n---\n")
            : "Waiting for messages..."}
        </pre>
      </>
    );
  }

  if (descriptor.widget.kind === "topic-plot") {
    const samples = data?.type === "topic-plot" ? data.samples : [];
    const latestSample = samples.at(-1);
    return (
      <>
        <strong>{descriptor.widget.title}</strong>
        <span>{topic}</span>
        <div className="bloom-topic-plot" data-sample-count={samples.length}>
          <span>{latestSample ? `latest: ${latestSample.value}` : "Waiting for samples..."}</span>
        </div>
        <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span>
      </>
    );
  }

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{topic}</span>
      <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span>
    </>
  );
}

function UnknownWidget({ descriptor }: UnknownWidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{descriptor.reason}</span>
    </>
  );
}

function getStringSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBooleanSetting(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

function getJoystickLabels(settings: Record<string, unknown>): JoystickLabels {
  const labels = settings.labels;
  if (!isRecord(labels)) {
    return { bottom: "Y-", left: "X-", right: "X+", top: "Y+" };
  }

  return {
    bottom: getStringSetting(labels, "bottom", "Y-"),
    left: getStringSetting(labels, "left", "X-"),
    right: getStringSetting(labels, "right", "X+"),
    top: getStringSetting(labels, "top", "Y+"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

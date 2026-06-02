import type { WidgetKind } from "@bloom/api-client";
import {
  createWidgetActionIntent,
  type WidgetActionIntent,
  type WidgetRenderContext,
  type WidgetRenderDescriptor,
} from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ReactNode } from "react";

export type WidgetRendererProps = {
  descriptor: Extract<WidgetRenderDescriptor, { status: "resolved" }>;
  onActionIntent?: WidgetActionIntentHandler;
};

export type UnknownWidgetRendererProps = {
  descriptor: Extract<WidgetRenderDescriptor, { status: "unknown" }>;
};

export type WidgetRenderer = (props: WidgetRendererProps) => ReactNode;

export type UnknownWidgetRenderer = (props: UnknownWidgetRendererProps) => ReactNode;

export type WidgetActionIntentHandler = (intent: WidgetActionIntent) => void;

export type WidgetRendererRegistration = {
  kind: WidgetKind;
  render: WidgetRenderer;
};

export type WidgetRendererRegistry = ReadonlyMap<WidgetKind, WidgetRenderer>;

export type ScreenRendererOptions = {
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

  return renderer({ descriptor, onActionIntent: options.onActionIntent });
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

function CommandLikeWidget({ descriptor }: WidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
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

function ToggleWidget({ descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
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

function JoystickWidget({ descriptor }: WidgetRendererProps) {
  const binding = getStringSetting(descriptor.widget.settings, "binding", "input");

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

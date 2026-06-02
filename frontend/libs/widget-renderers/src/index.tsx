import type { WidgetKind } from "@bloom/api-client";
import type { WidgetRenderContext, WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";

export type WidgetRendererProps = {
  descriptor: Extract<WidgetRenderDescriptor, { status: "resolved" }>;
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

  return renderer({ descriptor });
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

function SliderWidget({ descriptor }: WidgetRendererProps) {
  const min = descriptor.widget.settings.min;
  const max = descriptor.widget.settings.max;

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>
        {typeof min === "number" && typeof max === "number"
          ? `${descriptor.definition.displayName} ${min} → ${max}`
          : descriptor.definition.displayName}
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

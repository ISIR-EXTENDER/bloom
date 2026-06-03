import type { WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";

type WidgetFrameProps = {
  children: ReactNode;
  descriptor: WidgetRenderDescriptor;
};

export function WidgetFrame({ children, descriptor }: WidgetFrameProps) {
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

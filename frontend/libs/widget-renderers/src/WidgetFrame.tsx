import type { WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode, SyntheticEvent } from "react";
import type { WidgetControlState } from "./types";

type WidgetFrameProps = {
  children: ReactNode;
  controlState?: WidgetControlState;
  descriptor: WidgetRenderDescriptor;
};

export function WidgetFrame({ children, controlState, descriptor }: WidgetFrameProps) {
  const { widget } = descriptor;
  const displayName = descriptor.status === "resolved" ? descriptor.definition.displayName : "widget";
  const unavailable = controlState?.unavailable === true;
  const blockUnavailableInteraction = (event: SyntheticEvent) => {
    if (!unavailable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <article
      aria-disabled={unavailable || undefined}
      aria-label={`${widget.title} ${displayName}`}
      className={`widget-preview-card widget-preview-${descriptor.status}`}
      data-runtime-unavailable={unavailable ? "true" : undefined}
      data-screen-id={descriptor.context.screenId}
      data-widget-kind={widget.kind}
      style={{
        left: `${widget.layout.x}px`,
        top: `${widget.layout.y}px`,
        width: `${widget.layout.width}px`,
        // A card grows rather than clips (ADR 0132): the authored height is a floor.
        minHeight: `${widget.layout.height}px`,
      }}
    >
      <div
        aria-hidden={unavailable || undefined}
        className="bloom-runtime-widget-content"
        inert={unavailable || undefined}
        onClickCapture={blockUnavailableInteraction}
        onKeyDownCapture={blockUnavailableInteraction}
        onPointerDownCapture={blockUnavailableInteraction}
      >
        {children}
      </div>
      {unavailable ? (
        <div className="bloom-runtime-widget-unavailable" role="note">
          <strong>{widget.title} unavailable</strong>
          <span>{controlState?.disabledReason ?? "Required runtime connection is unavailable."}</span>
        </div>
      ) : null}
    </article>
  );
}

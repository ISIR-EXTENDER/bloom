import { createWidgetActionIntent, type WidgetActionIntent } from "@bloom/widgets";
import { useState } from "react";
import { getBooleanSetting, getNumberSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function CommandLikeWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const buttonLabel = getStringSetting(descriptor.widget.settings, "button_label", "") || descriptor.widget.title;
  const actionLabel = getStringSetting(descriptor.widget.settings, "action_label", "");
  const command = getStringSetting(descriptor.widget.settings, "command", "");
  const momentary = getBooleanSetting(descriptor.widget.settings, "momentary", false);
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const messageType = getStringSetting(descriptor.widget.settings, "messageType", "");

  const handlePress = () => {
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "press" }));
  };
  const publishMomentaryPayload = (payloadKey: "payload" | "releasedPayload") => {
    if (!topic || !messageType) {
      return;
    }
    onActionIntent?.({
      type: "topic-publish",
      widgetId: descriptor.widget.id,
      widgetKind: descriptor.widget.kind,
      topic,
      messageType,
      payload: descriptor.widget.settings[payloadKey],
    } satisfies WidgetActionIntent);
  };

  return (
    <div className="bloom-action-widget">
      <strong>{descriptor.widget.title}</strong>
      <button
        aria-label={buttonLabel}
        className="bloom-command-button"
        onClick={momentary ? undefined : handlePress}
        onPointerCancel={momentary ? () => publishMomentaryPayload("releasedPayload") : undefined}
        onPointerDown={momentary ? () => publishMomentaryPayload("payload") : undefined}
        onPointerLeave={momentary ? () => publishMomentaryPayload("releasedPayload") : undefined}
        onPointerUp={momentary ? () => publishMomentaryPayload("releasedPayload") : undefined}
        type="button"
      >
        {buttonLabel}
      </button>
      {actionLabel || command ? <span>{actionLabel || command}</span> : null}
    </div>
  );
}

export function LabelWidget({ descriptor }: WidgetRendererProps) {
  const text = getStringSetting(descriptor.widget.settings, "text", descriptor.widget.title);
  const fontSize = getNumberSetting(descriptor.widget.settings, "fontSize", 20);
  const align = getLabelAlignment(getStringSetting(descriptor.widget.settings, "align", "left"));

  return (
    <div className="bloom-label-widget" data-align={align} style={{ fontSize }}>
      <span>{text}</span>
    </div>
  );
}

export function ToggleWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const offLabel = getStringSetting(descriptor.widget.settings, "offLabel", "Inactive");
  const onLabel = getStringSetting(descriptor.widget.settings, "onLabel", "Active");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const [isOn, setIsOn] = useState(getBooleanSetting(descriptor.widget.settings, "initialValue", false));
  const stateLabel = isOn ? onLabel : offLabel;

  const handleToggle = () => {
    const nextState = isOn ? "off" : "on";
    setIsOn(nextState === "on");
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" }));
  };

  return (
    <div className="bloom-toggle-widget" data-state={isOn ? "active" : "inactive"}>
      <strong>{descriptor.widget.title}</strong>
      <button
        aria-pressed={isOn}
        aria-label={`${descriptor.widget.title}: ${stateLabel}`}
        className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
        onClick={handleToggle}
        type="button"
      >
        {stateLabel}
      </button>
      {showDetails && topic ? <span>{topic}</span> : null}
    </div>
  );
}

function getLabelAlignment(value: string): "center" | "left" | "right" {
  if (value === "center" || value === "right") {
    return value;
  }

  return "left";
}

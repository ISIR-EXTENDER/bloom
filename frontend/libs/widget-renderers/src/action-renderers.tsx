import { createWidgetActionIntent } from "@bloom/widgets";
import { useState } from "react";
import { getBooleanSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function CommandLikeWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const buttonLabel = getStringSetting(descriptor.widget.settings, "button_label", "") || descriptor.widget.title;
  const actionLabel = getStringSetting(descriptor.widget.settings, "action_label", "");
  const command = getStringSetting(descriptor.widget.settings, "command", "");

  const handlePress = () => {
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "press" }));
  };

  return (
    <div className="bloom-action-widget">
      <strong>{descriptor.widget.title}</strong>
      <button aria-label={buttonLabel} className="bloom-command-button" onClick={handlePress} type="button">
        {buttonLabel}
      </button>
      {actionLabel || command ? <span>{actionLabel || command}</span> : null}
    </div>
  );
}

export function LabelWidget({ descriptor }: WidgetRendererProps) {
  const text = getStringSetting(descriptor.widget.settings, "text", descriptor.widget.title);

  return (
    <>
      <strong>{text}</strong>
      <span>{descriptor.definition.displayName}</span>
    </>
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

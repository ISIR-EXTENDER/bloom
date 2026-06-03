import { createWidgetActionIntent } from "@bloom/widgets";
import { useState } from "react";
import { getBooleanSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function CommandLikeWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
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

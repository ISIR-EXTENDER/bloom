import { createWidgetActionIntent } from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useState } from "react";
import { JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";
import { clamp, getBooleanSetting, getJoystickLabels, getNumberSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function SliderWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", -1);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  const step = getNumberSetting(descriptor.widget.settings, "step", 0.01);
  const direction = getStringSetting(descriptor.widget.settings, "direction", "vertical");
  const returnToCenter = getBooleanSetting(descriptor.widget.settings, "returnToCenter", false);
  const defaultValue = clamp(0, min, max);
  const [currentValue, setCurrentValue] = useState(defaultValue);

  const emitValueChange = (value: number) => {
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-value", value }));
  };

  const handleValueChange = (values: number[]) => {
    const value = values[0];
    if (value === undefined) {
      return;
    }
    setCurrentValue(value);
    emitValueChange(value);
  };

  const handleReleaseToCenter = () => {
    if (!returnToCenter || currentValue === defaultValue) {
      return;
    }
    setCurrentValue(defaultValue);
    emitValueChange(defaultValue);
  };

  return (
    <div className="bloom-slider-widget" data-direction={direction === "horizontal" ? "horizontal" : "vertical"}>
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>
          {min} → {max}
        </span>
      </header>
      <SliderPrimitive.Root
        className={`bloom-slider bloom-slider-${direction === "horizontal" ? "horizontal" : "vertical"}`}
        data-orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        max={max}
        min={min}
        onBlur={handleReleaseToCenter}
        onValueChange={handleValueChange}
        onValueCommit={handleReleaseToCenter}
        orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        step={step}
        value={[currentValue]}
      >
        <SliderPrimitive.Track className="bloom-slider-track">
          <SliderPrimitive.Range className="bloom-slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={descriptor.widget.title} className="bloom-slider-thumb" />
      </SliderPrimitive.Root>
      <output aria-live="polite" className="bloom-control-readout">
        {currentValue.toFixed(resolveDecimalPlaces(step))}
      </output>
    </div>
  );
}

export function JoystickWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const binding = getStringSetting(descriptor.widget.settings, "binding", "input");
  const deadzone = getNumberSetting(descriptor.widget.settings, "deadzone", 0.1);
  const labels = getJoystickLabels(descriptor.widget.settings);
  const color = getStringSetting(descriptor.widget.settings, "accentColor", "#7fa95f");
  const size = resolveJoystickControlSize(descriptor.widget.layout.width, descriptor.widget.layout.height);
  const [currentVector, setCurrentVector] = useState<JoystickVector>({ x: 0, y: 0 });

  const handleVectorChange = (value: JoystickVector) => {
    setCurrentVector(value);
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-vector", value }));
  };

  return (
    <div className="bloom-joystick-widget">
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{binding}</span>
      </header>
      <JoystickPrimitive
        color={color}
        deadzone={deadzone}
        labels={labels}
        onVectorChange={handleVectorChange}
        size={size}
        title={descriptor.widget.title}
      />
      <output aria-live="polite" className="bloom-control-vector-readout">
        <span>x {currentVector.x.toFixed(2)}</span>
        <span>y {currentVector.y.toFixed(2)}</span>
      </output>
    </div>
  );
}

export function resolveJoystickControlSize(width: number, height: number): number {
  const horizontalRoom = Math.max(96, width - 56);
  const verticalRoom = Math.max(96, height - 118);
  return Math.round(clamp(Math.min(horizontalRoom, verticalRoom), 96, 260));
}

export function resolveDecimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 2;
  }

  const stepText = step.toString();
  if (!stepText.includes(".")) {
    return 0;
  }

  return Math.min(4, stepText.split(".")[1]?.length ?? 2);
}

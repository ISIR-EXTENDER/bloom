import { createWidgetActionIntent, normalizeWidgetSettings } from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useEffect, useRef, useState } from "react";
import { JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";
import {
  clamp,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  resolveJoystickBinding,
} from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function SliderWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", -1);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  const step = getNumberSetting(descriptor.widget.settings, "step", 0.01);
  const direction = getStringSetting(descriptor.widget.settings, "direction", "vertical");
  const returnToCenter = getBooleanSetting(descriptor.widget.settings, "returnToCenter", false);
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
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
    <div
      className="bloom-slider-widget"
      data-direction={direction === "horizontal" ? "horizontal" : "vertical"}
      data-show-details={showDetails ? "true" : "false"}
    >
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span className={showDetails ? undefined : "bloom-control-detail-hidden"}>
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
      <output aria-live="polite" className={showDetails ? "bloom-control-readout" : "bloom-control-readout sr-only"}>
        {currentValue.toFixed(resolveDecimalPlaces(step))}
      </output>
    </div>
  );
}

export function JoystickWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const normalizedSettings = normalizeWidgetSettings("joystick", descriptor.widget.settings);
  const joystickSettings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  const deadzone = getNumberSetting(joystickSettings, "deadzone", 0.1);
  const binding = resolveJoystickBinding(joystickSettings);
  const color = getStringSetting(descriptor.widget.settings, "accentColor", "#7fa95f");
  const showDetails = getBooleanSetting(joystickSettings, "show_details", false);
  const size = resolveJoystickControlSize(descriptor.widget.layout.width, descriptor.widget.layout.height);
  const [currentVector, setCurrentVector] = useState<JoystickVector>({ x: 0, y: 0 });
  const isHeldRef = useRef(false);
  const latestVectorRef = useRef<JoystickVector>({ x: 0, y: 0 });
  const onActionIntentRef = useRef(onActionIntent);
  const widgetRef = useRef(descriptor.widget);

  useEffect(() => {
    onActionIntentRef.current = onActionIntent;
    widgetRef.current = descriptor.widget;
  }, [descriptor.widget, onActionIntent]);

  const handleVectorChange = (value: JoystickVector) => {
    latestVectorRef.current = value;
    setCurrentVector(value);
    emitJoystickVectorChange(widgetRef.current, onActionIntentRef.current, value);
  };

  const handleInteractionStart = () => {
    isHeldRef.current = true;
  };

  const handleInteractionEnd = () => {
    isHeldRef.current = false;
  };

  useEffect(() => {
    const intervalMs = Math.round(1000 / binding.publishRateHz);
    const interval = window.setInterval(() => {
      if (isHeldRef.current) {
        emitJoystickVectorChange(widgetRef.current, onActionIntentRef.current, latestVectorRef.current);
      }
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [binding.publishRateHz]);

  return (
    <div className="bloom-joystick-widget" data-show-details={showDetails ? "true" : "false"}>
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span className={showDetails ? undefined : "bloom-control-detail-hidden"}>{binding.modeId}</span>
      </header>
      {showDetails ? (
        <div className="bloom-joystick-mode-strip" aria-label={`Joystick mode ${binding.modeId}`} role="note">
          <span>{binding.axisSummary}</span>
          <span>{binding.publishRateHz} Hz</span>
          <span>{binding.runtimeTarget}</span>
        </div>
      ) : null}
      <JoystickPrimitive
        color={color}
        deadzone={deadzone}
        labelColors={binding.labelColors}
        labels={binding.labels}
        onInteractionEnd={handleInteractionEnd}
        onInteractionStart={handleInteractionStart}
        onVectorChange={handleVectorChange}
        size={size}
        title={descriptor.widget.title}
        zeroOnRelease={binding.zeroOnRelease}
      />
      <output
        aria-live="polite"
        className={showDetails ? "bloom-control-vector-readout" : "bloom-control-vector-readout sr-only"}
      >
        <span>x {currentVector.x.toFixed(2)}</span>
        <span>y {currentVector.y.toFixed(2)}</span>
      </output>
    </div>
  );
}

function emitJoystickVectorChange(
  widget: WidgetRendererProps["descriptor"]["widget"],
  onActionIntent: WidgetRendererProps["onActionIntent"],
  value: JoystickVector,
) {
  onActionIntent?.(createWidgetActionIntent(widget, { type: "set-vector", value }));
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

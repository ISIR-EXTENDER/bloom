import { createWidgetActionIntent, normalizeWidgetSettings, resolveWidgetDestination } from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";
import {
  clamp,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  resolveJoystickBinding,
} from "./settings-readers";
import type { WidgetRendererProps } from "./types";

const SLIDER_LATCH_EXPIRY_MS = 15000;

export function SliderWidget({ descriptor, motorPreset, onActionIntent }: WidgetRendererProps) {
  // Normalize first: configs carry snake_case aliases for these keys.
  const normalizedSettings = normalizeWidgetSettings("slider", descriptor.widget.settings);
  const sliderSettings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  const min = getNumberSetting(sliderSettings, "min", -1);
  const max = getNumberSetting(sliderSettings, "max", 1);
  const step = getNumberSetting(sliderSettings, "step", 0.01);
  const direction = getStringSetting(sliderSettings, "direction", "vertical");
  const returnToCenter = getBooleanSetting(sliderSettings, "returnToCenter", false);
  const showDetails = getBooleanSetting(sliderSettings, "show_details", false);
  const intentLabel = getStringSetting(sliderSettings, "intent_label", "");
  const unit = getStringSetting(sliderSettings, "unit", "");
  const defaultValue = clamp(0, min, max);
  const [currentValue, setCurrentValue] = useState(defaultValue);
  const formattedValue = formatSliderValue(currentValue, step, unit);

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
    // Latch keeps the released value; the zero control releases it.
    if (motorPreset === "latch" || !returnToCenter || currentValue === defaultValue) {
      return;
    }
    setCurrentValue(defaultValue);
    emitValueChange(defaultValue);
  };

  const setAndEmit = (value: number) => {
    setCurrentValue(value);
    emitValueChange(value);
  };

  // A latched command must never outlive the operator's attention.
  const valueIsHeld =
    (motorPreset === "latch" || motorPreset === "step") && returnToCenter && currentValue !== defaultValue;
  useEffect(() => {
    if (!valueIsHeld) {
      return;
    }
    const expiry = window.setTimeout(() => setAndEmit(defaultValue), SLIDER_LATCH_EXPIRY_MS);
    return () => window.clearTimeout(expiry);
  });

  if (motorPreset === "step") {
    const stepBy = (delta: number) => setAndEmit(Number(clamp(currentValue + delta, min, max).toFixed(4)));
    return (
      <div
        className="bloom-slider-widget"
        data-direction={direction === "horizontal" ? "horizontal" : "vertical"}
        data-motor-preset="step"
        data-show-details={showDetails ? "true" : "false"}
      >
        <header className="bloom-control-header">
          <strong>
            {descriptor.widget.title}
            {unit ? <small className="bloom-control-unit">{unit}</small> : null}
          </strong>
          <span>step</span>
        </header>
        <div aria-label={`${descriptor.widget.title} step controls`} className="bloom-slider-stepper" role="group">
          <button
            aria-label={`Increase ${descriptor.widget.title} by ${step}`}
            className="bloom-slider-step-button"
            disabled={currentValue >= max}
            onClick={() => stepBy(step)}
            type="button"
          >
            +
          </button>
          <output aria-live="polite" className="bloom-slider-step-readout">
            {formattedValue}
          </output>
          {returnToCenter ? (
            <button
              aria-label={`Zero ${descriptor.widget.title}`}
              className="bloom-slider-step-button"
              disabled={currentValue === defaultValue}
              onClick={() => setAndEmit(defaultValue)}
              type="button"
            >
              0
            </button>
          ) : null}
          <button
            aria-label={`Decrease ${descriptor.widget.title} by ${step}`}
            className="bloom-slider-step-button"
            disabled={currentValue <= min}
            onClick={() => stepBy(-step)}
            type="button"
          >
            &minus;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bloom-slider-widget"
      data-binding={getStringSetting(sliderSettings, "binding", "value")}
      data-direction={direction === "horizontal" ? "horizontal" : "vertical"}
      data-show-details={showDetails ? "true" : "false"}
    >
      <header className="bloom-control-header">
        <strong>
          {descriptor.widget.title}
          {unit ? <small className="bloom-control-unit">{unit}</small> : null}
        </strong>
        <span className={showDetails ? undefined : "bloom-control-detail-hidden"}>
          {formatSliderValue(min, step, unit)} → {formatSliderValue(max, step, unit)}
        </span>
      </header>
      {intentLabel ? (
        <p className={showDetails ? "bloom-control-intent" : "bloom-control-intent sr-only"}>{intentLabel}</p>
      ) : null}
      <SliderPrimitive.Root
        className={`bloom-slider bloom-slider-${direction === "horizontal" ? "horizontal" : "vertical"}`}
        data-orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        data-return-to-center={returnToCenter ? "true" : "false"}
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
        {formattedValue}
      </output>
    </div>
  );
}

const STEP_ZONE_INCREMENT = 0.25;
const LATCH_EXPIRY_MS = 15000;

export function JoystickWidget({ descriptor, motorPreset, onActionIntent }: WidgetRendererProps) {
  const normalizedSettings = normalizeWidgetSettings("joystick", descriptor.widget.settings);
  const joystickSettings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  const deadzone = getNumberSetting(joystickSettings, "deadzone", 0.1);
  const binding = resolveJoystickBinding(joystickSettings);
  // The legacy fallback resolves to a semantic name like "translation", or to
  // the literal "input", neither of which is a topic. Show where the joystick
  // actually publishes instead.
  const destination = resolveWidgetDestination(descriptor.widget.kind, joystickSettings);
  const color = getStringSetting(descriptor.widget.settings, "accentColor", "#7fa95f");
  const showDetails = getBooleanSetting(joystickSettings, "show_details", false);
  const size = resolveJoystickControlSize(descriptor.widget.layout.width, descriptor.widget.layout.height, {
    showDetails,
  });
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

  const emitHeldVector = (vector: JoystickVector) => {
    latestVectorRef.current = vector;
    setCurrentVector(vector);
    emitJoystickVectorChange(widgetRef.current, onActionIntentRef.current, vector);
  };

  // A latched command must never outlive the operator's attention.
  const isLatched = motorPreset === "latch" || motorPreset === "step";
  const vectorIsHeld = isLatched && (currentVector.x !== 0 || currentVector.y !== 0);
  useEffect(() => {
    if (!vectorIsHeld) {
      return;
    }
    const expiry = window.setTimeout(() => emitHeldVector({ x: 0, y: 0 }), LATCH_EXPIRY_MS);
    return () => window.clearTimeout(expiry);
  });

  if (motorPreset === "step") {
    return (
      <StepZoneJoystick
        currentVector={currentVector}
        descriptor={descriptor}
        labels={binding.labels}
        onVector={emitHeldVector}
        showDetails={showDetails}
      />
    );
  }

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
          <span>{destination?.topic ?? binding.runtimeTarget}</span>
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
        zeroOnRelease={motorPreset === "latch" ? false : binding.zeroOnRelease}
      />
      {motorPreset === "latch" ? (
        <button
          aria-label={`Zero ${descriptor.widget.title}`}
          className="bloom-latch-zero"
          disabled={!vectorIsHeld}
          onClick={() => emitHeldVector({ x: 0, y: 0 })}
          type="button"
        >
          Zero
        </button>
      ) : null}
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

/**
 * The joystick as four tap-to-increment targets plus a stop: no sustained
 * dragging, no held pressure. Each tap moves the held vector one step; the
 * teleop stream keeps it alive between taps.
 */
function StepZoneJoystick({
  currentVector,
  descriptor,
  labels,
  onVector,
  showDetails,
}: {
  currentVector: JoystickVector;
  descriptor: WidgetRendererProps["descriptor"];
  labels: { bottom: string; left: string; right: string; top: string };
  onVector: (vector: JoystickVector) => void;
  showDetails: boolean;
}) {
  const stepBy = (dx: number, dy: number) =>
    onVector({
      x: Number(clamp(currentVector.x + dx, -1, 1).toFixed(2)),
      y: Number(clamp(currentVector.y + dy, -1, 1).toFixed(2)),
    });

  return (
    <div className="bloom-joystick-widget" data-motor-preset="step" data-show-details={showDetails ? "true" : "false"}>
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>step</span>
      </header>
      <div aria-label={`${descriptor.widget.title} step targets`} className="bloom-step-zones" role="group">
        <button
          aria-label={`${labels.top}, one step`}
          className="bloom-step-zone"
          data-zone="top"
          onClick={() => stepBy(0, STEP_ZONE_INCREMENT)}
          type="button"
        >
          {labels.top}
        </button>
        <button
          aria-label={`${labels.left}, one step`}
          className="bloom-step-zone"
          data-zone="left"
          onClick={() => stepBy(-STEP_ZONE_INCREMENT, 0)}
          type="button"
        >
          {labels.left}
        </button>
        <button
          aria-label={`Stop ${descriptor.widget.title}`}
          className="bloom-step-zone"
          data-zone="stop"
          onClick={() => onVector({ x: 0, y: 0 })}
          type="button"
        >
          0
        </button>
        <button
          aria-label={`${labels.right}, one step`}
          className="bloom-step-zone"
          data-zone="right"
          onClick={() => stepBy(STEP_ZONE_INCREMENT, 0)}
          type="button"
        >
          {labels.right}
        </button>
        <button
          aria-label={`${labels.bottom}, one step`}
          className="bloom-step-zone"
          data-zone="bottom"
          onClick={() => stepBy(0, -STEP_ZONE_INCREMENT)}
          type="button"
        >
          {labels.bottom}
        </button>
      </div>
      <output aria-live="polite" className="bloom-control-vector-readout">
        <span>x {currentVector.x.toFixed(2)}</span>
        <span>y {currentVector.y.toFixed(2)}</span>
      </output>
    </div>
  );
}

export function GesturePadWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const angleLabel = getStringSetting(descriptor.widget.settings, "angleLabel", "Angle");
  const powerLabel = getStringSetting(descriptor.widget.settings, "powerLabel", "Power");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const [gesture, setGesture] = useState({ angleDegrees: 45, power: 0.5 });

  const emitGesture = (nextGesture: { angleDegrees: number; power: number }) => {
    setGesture(nextGesture);
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-gesture", value: nextGesture }));
  };

  const handlePointerGesture = (event: PointerEvent<HTMLButtonElement>) => {
    emitGesture(resolveGestureFromPointer(event));
  };

  const handleKeyboardGesture = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nextGesture = resolveGestureFromKeyboard(event, gesture);
    if (!nextGesture) {
      return;
    }
    event.preventDefault();
    emitGesture(nextGesture);
  };

  const angle = Math.round(gesture.angleDegrees);
  const power = Math.round(gesture.power * 100);

  return (
    <div className="bloom-gesture-widget" data-show-details={showDetails ? "true" : "false"}>
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span className={showDetails ? undefined : "bloom-control-detail-hidden"}>
          {angleLabel} / {powerLabel}
        </span>
      </header>
      <button
        aria-label={`${descriptor.widget.title}: choose trajectory gesture`}
        className="bloom-gesture-pad"
        onKeyDown={handleKeyboardGesture}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePointerGesture(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            handlePointerGesture(event);
          }
        }}
        type="button"
      >
        <span aria-hidden="true" className="bloom-gesture-arc" />
        <span
          aria-hidden="true"
          className="bloom-gesture-vector"
          style={
            {
              "--bloom-gesture-angle": `${angle}deg`,
              "--bloom-gesture-power": gesture.power.toString(),
            } as CSSProperties
          }
        />
        <span className="bloom-gesture-hint">Drag to set trajectory</span>
      </button>
      <output aria-live="polite" className={showDetails ? "bloom-control-readout" : "bloom-control-readout sr-only"}>
        {angleLabel} {angle} deg · {powerLabel} {power}%
      </output>
    </div>
  );
}

function resolveGestureFromPointer(event: PointerEvent<HTMLElement>): { angleDegrees: number; power: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const normalizedX = clamp(x / Math.max(rect.width, 1), 0, 1);
  const normalizedY = clamp(1 - y / Math.max(rect.height, 1), 0, 1);
  const angleDegrees = Math.round(normalizedX * 180);
  const power = Number(normalizedY.toFixed(3));
  return { angleDegrees, power };
}

function resolveGestureFromKeyboard(
  event: KeyboardEvent<HTMLElement>,
  currentGesture: { angleDegrees: number; power: number },
): { angleDegrees: number; power: number } | null {
  if (event.key === "ArrowLeft") {
    return { ...currentGesture, angleDegrees: Math.round(clamp(currentGesture.angleDegrees - 5, 0, 180)) };
  }
  if (event.key === "ArrowRight") {
    return { ...currentGesture, angleDegrees: Math.round(clamp(currentGesture.angleDegrees + 5, 0, 180)) };
  }
  if (event.key === "ArrowDown") {
    return { ...currentGesture, power: Number(clamp(currentGesture.power - 0.05, 0, 1).toFixed(3)) };
  }
  if (event.key === "ArrowUp") {
    return { ...currentGesture, power: Number(clamp(currentGesture.power + 0.05, 0, 1).toFixed(3)) };
  }
  return null;
}

function emitJoystickVectorChange(
  widget: WidgetRendererProps["descriptor"]["widget"],
  onActionIntent: WidgetRendererProps["onActionIntent"],
  value: JoystickVector,
) {
  onActionIntent?.(createWidgetActionIntent(widget, { type: "set-vector", value }));
}

type JoystickControlSizeOptions = {
  showDetails?: boolean;
};

export function resolveJoystickControlSize(
  width: number,
  height: number,
  options: JoystickControlSizeOptions = {},
): number {
  const controlChromeHeight = options.showDetails ? 118 : 56;
  const horizontalRoom = Math.max(96, width - 40);
  const verticalRoom = Math.max(96, height - controlChromeHeight);
  return Math.round(clamp(Math.min(horizontalRoom, verticalRoom), 96, 400));
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

function formatSliderValue(value: number, step: number, unit: string): string {
  const formatted = value.toFixed(resolveDecimalPlaces(step));
  return unit ? `${formatted} ${unit}` : formatted;
}

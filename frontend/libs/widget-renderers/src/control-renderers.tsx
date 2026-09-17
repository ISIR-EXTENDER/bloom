import {
  createWidgetActionIntent,
  localizeOperatorText,
  normalizeWidgetSettings,
  resolveWidgetDestination,
} from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { bindArrowToWord, JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";
import {
  clamp,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  resolveJoystickBinding,
} from "./settings-readers";
import type { WidgetRendererProps } from "./types";
import { useSettledAnnouncement } from "./use-settled-announcement";

const SLIDER_LATCH_EXPIRY_MS = 15000;
const SLIDER_STEP_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);

const STEP_TARGET_HINTS: Partial<Record<NonNullable<WidgetRendererProps["motorPreset"]>, string>> = {
  dwell: "rest to move",
  scan: "scan",
  step: "step",
};

type StepTargetPreset = keyof typeof STEP_TARGET_HINTS;

function resolveStepTargetPreset(motorPreset: WidgetRendererProps["motorPreset"]): StepTargetPreset | null {
  return motorPreset && motorPreset in STEP_TARGET_HINTS ? (motorPreset as StepTargetPreset) : null;
}

export function SliderWidget({
  descriptor,
  language,
  motorPreset,
  neutralRevision,
  onActionIntent,
}: WidgetRendererProps) {
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
  const configuredValue = getNumberSetting(sliderSettings, "value", 0);
  const defaultValue = clamp(returnToCenter ? 0 : configuredValue, min, max);
  const [currentValue, setCurrentValue] = useState(defaultValue);
  // Counts operator input, so the attention window restarts on input only.
  const [inputRevision, setInputRevision] = useState(0);
  const formattedValue = formatSliderValue(currentValue, step, unit);
  // A live region cannot follow a dragged axis; it announces where it came to rest.
  const announcedValue = useSettledAnnouncement(formattedValue);
  const stepPreset = resolveStepTargetPreset(motorPreset);
  const usesStepTargets = stepPreset !== null;

  const emitValueChange = (value: number) => {
    setInputRevision((revision) => revision + 1);
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

  // Latch keeps the released value; the zero control releases it.
  const releasesToCenter = returnToCenter && motorPreset !== "latch";
  // Keys still down, so a keyboard nudge is momentary like a pointer drag.
  const heldKeysRef = useRef(new Set<string>());

  const releaseToCenter = () => {
    if (!releasesToCenter || currentValue === defaultValue) {
      return;
    }
    setCurrentValue(defaultValue);
    emitValueChange(defaultValue);
  };

  const handleValueCommit = () => {
    if (heldKeysRef.current.size === 0) {
      releaseToCenter();
    }
  };

  const handleBlur = () => {
    heldKeysRef.current.clear();
    releaseToCenter();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!releasesToCenter) {
      return;
    }
    // Home and End would jump to full scale; Home returns to rest instead.
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (event.key === "Home") {
        releaseToCenter();
      }
      return;
    }
    if (SLIDER_STEP_KEYS.has(event.key)) {
      heldKeysRef.current.add(event.key);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (heldKeysRef.current.delete(event.key) && heldKeysRef.current.size === 0) {
      releaseToCenter();
    }
  };

  const setAndEmit = (value: number) => {
    setCurrentValue(value);
    emitValueChange(value);
  };

  // A latched command must never outlive the operator's attention. Scanning,
  // telemetry and status polls re-render constantly, so the window is keyed on
  // input rather than restarted by every render.
  const valueIsHeld = (motorPreset === "latch" || usesStepTargets) && returnToCenter && currentValue !== defaultValue;

  // After a runtime suspend a held value is gone on the robot, so it goes from
  // the control too. A configured value, such as a speed limit, stays.
  const lastNeutralRevisionRef = useRef(neutralRevision);
  const returnToRestRef = useRef(() => {});
  returnToRestRef.current = () => {
    if (returnToCenter) {
      setCurrentValue(defaultValue);
    }
  };
  useEffect(() => {
    if (neutralRevision === lastNeutralRevisionRef.current) {
      return;
    }
    lastNeutralRevisionRef.current = neutralRevision;
    returnToRestRef.current();
  }, [neutralRevision]);
  const expireHeldValueRef = useRef(() => {});
  expireHeldValueRef.current = () => setAndEmit(defaultValue);
  useEffect(() => {
    void inputRevision;
    if (!valueIsHeld) {
      return;
    }
    const expiry = window.setTimeout(() => expireHeldValueRef.current(), SLIDER_LATCH_EXPIRY_MS);
    return () => window.clearTimeout(expiry);
  }, [inputRevision, valueIsHeld]);

  if (stepPreset) {
    const stepBy = (delta: number) => setAndEmit(Number(clamp(currentValue + delta, min, max).toFixed(4)));
    return (
      <div
        className="bloom-slider-widget bloom-info-card"
        data-direction={direction === "horizontal" ? "horizontal" : "vertical"}
        data-motor-preset={stepPreset}
        data-show-details={showDetails ? "true" : "false"}
      >
        <header className="bloom-control-header">
          <strong>
            {descriptor.widget.title}
            {/* The space is read: without it a screen reader says "Max speedm/s". */}
            {unit ? <small className="bloom-control-unit"> {unit}</small> : null}
          </strong>
          <span>{STEP_TARGET_HINTS[stepPreset]}</span>
        </header>
        <fieldset aria-label={`${descriptor.widget.title} step controls`} className="bloom-slider-stepper">
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
        </fieldset>
      </div>
    );
  }

  const orientation: "horizontal" | "vertical" = direction === "horizontal" ? "horizontal" : "vertical";
  const radixHandlers = {
    max,
    min,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
    onValueChange: handleValueChange,
    onValueCommit: handleValueCommit,
    orientation,
    step,
    value: [currentValue],
  } satisfies SliderPrimitive.SliderProps;

  const segmentLabels = readStringList(sliderSettings.segment_labels);
  const segmentValues = readNumberList(sliderSettings.segment_values);
  if (getStringSetting(sliderSettings, "variant", "") === "segments" && segmentValues.length > 0) {
    return (
      <div
        className="bloom-slider-widget bloom-info-card"
        data-show-details={showDetails ? "true" : "false"}
        data-slider-kind="segments"
      >
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <output className="bloom-widget-readout">{formattedValue}</output>
        </header>
        <fieldset aria-label={descriptor.widget.title} className="bloom-segments">
          {segmentValues.map((value, index) => {
            const selected = Math.abs(value - currentValue) < 1e-9;
            return (
              <button
                aria-pressed={selected}
                className="bloom-segment"
                data-selected={selected ? "true" : undefined}
                key={value}
                onClick={() => setAndEmit(clamp(value, min, max))}
                type="button"
              >
                {segmentLabels[index] ?? formatLimitValue(value, unit)}
              </button>
            );
          })}
        </fieldset>
      </div>
    );
  }

  if (!returnToCenter) {
    const axisWord = unit === "m/s" ? "linear" : unit === "rad/s" ? "angular" : "";
    return (
      <div
        className="bloom-slider-widget bloom-info-card"
        data-show-details={showDetails ? "true" : "false"}
        data-slider-kind="limit"
      >
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <output aria-live="polite" className="bloom-widget-readout">
            {formattedValue}
          </output>
        </header>
        {intentLabel ? <p className={showDetails ? "bloom-control-intent" : "sr-only"}>{intentLabel}</p> : null}
        <SliderPrimitive.Root className="bloom-limit-slider" data-orientation={orientation} {...radixHandlers}>
          <SliderPrimitive.Track className="bloom-limit-track">
            <SliderPrimitive.Range className="bloom-limit-range" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb aria-label={descriptor.widget.title} className="bloom-limit-thumb" />
        </SliderPrimitive.Root>
        <p className="bloom-limit-range-line">
          {min.toFixed(2)} → {max.toFixed(2)}
          {axisWord ? ` · ${axisWord}` : ""}
        </p>
      </div>
    );
  }

  const placement = resolveTitlePlacement(descriptor.widget, showDetails);
  const authoredWords = resolveAxisWords(sliderSettings, orientation);
  const words = {
    negative: localizeOperatorText(authoredWords.negative, language),
    positive: localizeOperatorText(authoredWords.positive, language),
  };
  const bindingTarget =
    typeof sliderSettings.runtime_binding === "object" && sliderSettings.runtime_binding !== null
      ? String((sliderSettings.runtime_binding as Record<string, unknown>).target ?? "")
      : "";
  const readout = formatSignedValue(currentValue);
  return (
    <div
      className="bloom-slider-widget"
      data-axis={/angular|rotation/.test(bindingTarget) ? "rotation" : "translation"}
      data-direction={orientation}
      data-show-details={showDetails ? "true" : "false"}
      data-slider-kind="motion"
      data-title-placement={placement}
    >
      {placement === "above" ? (
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <output aria-live="off" className="bloom-widget-readout">
            {readout}
          </output>
        </header>
      ) : null}
      <div className="bloom-control-surface bloom-axis-surface">
        {placement === "overlay" ? (
          <>
            <strong className="bloom-axis-title">{descriptor.widget.title}</strong>
            <output aria-live="off" className="bloom-axis-readout">
              {readout}
            </output>
          </>
        ) : null}
        <span aria-hidden="true" className="bloom-axis-word" data-end="negative">
          {bindArrowToWord(words.negative)}
        </span>
        <span aria-hidden="true" className="bloom-axis-word" data-end="positive">
          {bindArrowToWord(words.positive)}
        </span>
        <span aria-hidden="true" className="bloom-axis-tick" />
        <SliderPrimitive.Root
          className="bloom-axis-slider"
          data-orientation={orientation}
          data-return-to-center="true"
          {...radixHandlers}
        >
          <SliderPrimitive.Track className="bloom-axis-track">
            <SliderPrimitive.Range className="bloom-axis-range" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb aria-label={descriptor.widget.title} className="bloom-axis-knob" />
        </SliderPrimitive.Root>
      </div>
      <output aria-live="polite" className="sr-only">
        {announcedValue}
      </output>
    </div>
  );
}

function resolveAxisWords(
  settings: Record<string, unknown>,
  orientation: "horizontal" | "vertical",
): { negative: string; positive: string } {
  const labels =
    typeof settings.labels === "object" && settings.labels !== null ? (settings.labels as Record<string, unknown>) : {};
  const fallback =
    orientation === "vertical" ? { negative: "▼ Down", positive: "▲ Up" } : { negative: "◀ Left", positive: "Right ▶" };
  return {
    negative: typeof labels.negative === "string" && labels.negative ? labels.negative : fallback.negative,
    positive: typeof labels.positive === "string" && labels.positive ? labels.positive : fallback.positive,
  };
}

function formatLimitValue(value: number, unit: string): string {
  return unit ? `${value.toFixed(2)} ${unit}` : value.toFixed(2);
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNumberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

const STEP_ZONE_INCREMENT = 0.25;
const LATCH_EXPIRY_MS = 15000;

export function JoystickWidget({
  conditioning,
  descriptor,
  motorPreset,
  neutralRevision,
  onActionIntent,
}: WidgetRendererProps) {
  const normalizedSettings = normalizeWidgetSettings("joystick", descriptor.widget.settings);
  const joystickSettings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  // The profile's dead zone belongs to the person, not the app: a widget's
  // hard-coded value cannot know whose hand is on the glass.
  const profileDeadzone = conditioning?.deadzone ?? 0;
  const deadzone = profileDeadzone > 0 ? profileDeadzone : getNumberSetting(joystickSettings, "deadzone", 0.1);
  const binding = resolveJoystickBinding(joystickSettings);
  // The legacy fallback resolves to a semantic name like "translation", or to
  // the literal "input", neither of which is a topic. Show where the joystick
  // actually publishes instead.
  const destination = resolveWidgetDestination(descriptor.widget.kind, joystickSettings);
  const showDetails = getBooleanSetting(joystickSettings, "show_details", false);
  const placement = resolveTitlePlacement(descriptor.widget, showDetails);
  const size = resolveJoystickControlSize(descriptor.widget.layout.width, descriptor.widget.layout.height, {
    placement,
    showDetails,
  });
  const [currentVector, setCurrentVector] = useState<JoystickVector>({ x: 0, y: 0 });
  // A live region cannot follow a pad at 30 Hz; it announces where it came to rest.
  const announcedVector = useSettledAnnouncement(`x ${currentVector.x.toFixed(2)} y ${currentVector.y.toFixed(2)}`);
  // Counts operator input, so the attention window restarts on input only.
  const [inputRevision, setInputRevision] = useState(0);
  const [padResetSignal, setPadResetSignal] = useState(0);
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
    setInputRevision((revision) => revision + 1);
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
    setInputRevision((revision) => revision + 1);
    if (vector.x === 0 && vector.y === 0) {
      setPadResetSignal((signal) => signal + 1);
    }
    emitJoystickVectorChange(widgetRef.current, onActionIntentRef.current, vector);
  };

  // After a runtime suspend the robot holds nothing, so neither does the
  // control: the next tap starts from rest, not from the stale vector.
  const lastNeutralRevisionRef = useRef(neutralRevision);
  const returnToRestRef = useRef(() => {});
  returnToRestRef.current = () => {
    latestVectorRef.current = { x: 0, y: 0 };
    isHeldRef.current = false;
    setCurrentVector({ x: 0, y: 0 });
    setPadResetSignal((signal) => signal + 1);
  };
  useEffect(() => {
    if (neutralRevision === lastNeutralRevisionRef.current) {
      return;
    }
    lastNeutralRevisionRef.current = neutralRevision;
    returnToRestRef.current();
  }, [neutralRevision]);

  // A latched command must never outlive the operator's attention. Keyed on
  // input, because re-renders from scanning or telemetry would otherwise
  // restart the window forever.
  const stepPreset = resolveStepTargetPreset(motorPreset);
  // An authored zero_on_release: false holds the vector just like the latch preset.
  const keepsReleasedVector = motorPreset === "latch" || !binding.zeroOnRelease;
  const isLatched = keepsReleasedVector || stepPreset !== null;
  const vectorIsHeld = isLatched && (currentVector.x !== 0 || currentVector.y !== 0);
  const expireHeldVectorRef = useRef(() => {});
  expireHeldVectorRef.current = () => emitHeldVector({ x: 0, y: 0 });
  useEffect(() => {
    void inputRevision;
    if (!vectorIsHeld) {
      return;
    }
    const expiry = window.setTimeout(() => expireHeldVectorRef.current(), LATCH_EXPIRY_MS);
    return () => window.clearTimeout(expiry);
  }, [inputRevision, vectorIsHeld]);

  if (stepPreset) {
    return (
      <StepZoneJoystick
        currentVector={currentVector}
        descriptor={descriptor}
        labels={binding.labels}
        motorPreset={stepPreset}
        onVector={emitHeldVector}
        showDetails={showDetails}
      />
    );
  }

  const isRotation = binding.knobColor.includes("rotation");
  const readout = formatVectorReadout(currentVector, isRotation);
  const pad = (
    <JoystickPrimitive
      color={binding.knobColor}
      deadzone={deadzone}
      labels={binding.labels}
      onInteractionEnd={handleInteractionEnd}
      onInteractionStart={handleInteractionStart}
      onVectorChange={handleVectorChange}
      resetSignal={padResetSignal}
      size={size}
      title={descriptor.widget.title}
      zeroOnRelease={!keepsReleasedVector}
    />
  );

  return (
    <div
      className="bloom-joystick-widget"
      data-show-details={showDetails ? "true" : "false"}
      data-title-placement={placement}
    >
      {placement === "above" ? (
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <output aria-live="off" className="bloom-widget-readout">
            {readout}
          </output>
        </header>
      ) : null}
      {showDetails ? (
        <div className="bloom-joystick-mode-strip" aria-label={`Joystick mode ${binding.modeId}`} role="note">
          <span>{binding.modeId}</span>
          <span>{binding.axisSummary}</span>
          <span>{binding.publishRateHz} Hz</span>
          <span>{destination?.topic ?? binding.runtimeTarget}</span>
        </div>
      ) : null}
      <div className="bloom-control-surface bloom-pad-surface">
        {placement === "overlay" ? (
          <>
            <strong className="bloom-pad-title">{descriptor.widget.title}</strong>
            <output aria-live="off" className="bloom-pad-readout">
              {readout}
            </output>
          </>
        ) : null}
        {pad}
        {keepsReleasedVector ? (
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
      </div>
      <output aria-live="polite" className="sr-only">
        {announcedVector}
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
  motorPreset,
  onVector,
  showDetails,
}: {
  currentVector: JoystickVector;
  descriptor: WidgetRendererProps["descriptor"];
  labels: { bottom: string; left: string; right: string; top: string };
  motorPreset: StepTargetPreset;
  onVector: (vector: JoystickVector) => void;
  showDetails: boolean;
}) {
  const stepBy = (dx: number, dy: number) =>
    onVector({
      x: Number(clamp(currentVector.x + dx, -1, 1).toFixed(2)),
      y: Number(clamp(currentVector.y + dy, -1, 1).toFixed(2)),
    });

  return (
    <div
      className="bloom-joystick-widget bloom-info-card"
      data-motor-preset={motorPreset}
      data-show-details={showDetails ? "true" : "false"}
    >
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{STEP_TARGET_HINTS[motorPreset]}</span>
      </header>
      <fieldset aria-label={`${descriptor.widget.title} step targets`} className="bloom-step-zones">
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
      </fieldset>
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
  placement?: TitlePlacement;
  showDetails?: boolean;
};

/** The pad edge inside its 2 px surface border; `above` spends 32 px on the title row. */
export function resolveJoystickControlSize(
  width: number,
  height: number,
  options: JoystickControlSizeOptions = {},
): number {
  const chrome = (options.placement === "above" ? 32 : 0) + (options.showDetails ? 38 : 0);
  return Math.max(96, Math.min(width, height - chrome) - 4);
}

export type TitlePlacement = "above" | "overlay";

/**
 * Bench cards overlay the title in the control's own corner; operator cards carry it in a row above. An authored
 * `title_placement` wins; otherwise a control with 32 px to spare beyond its body takes the row.
 */
export function resolveTitlePlacement(
  widget: { kind: string; layout: { width: number; height: number }; settings: Record<string, unknown> },
  showDetails = false,
): TitlePlacement {
  const authored = widget.settings.title_placement;
  if (authored === "above" || authored === "overlay") {
    return authored;
  }
  if (showDetails) {
    return "above";
  }
  const { width, height } = widget.layout;
  if (widget.kind === "joystick") {
    return height - width >= 32 ? "above" : "overlay";
  }
  if (widget.kind === "slider" && widget.settings.direction === "horizontal") {
    return height >= 146 ? "above" : "overlay";
  }
  return "overlay";
}

/** Signed to two places with a true minus, the way every design readout prints. */
export function formatSignedValue(value: number): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded < 0 ? "\u2212" : "+"}${Math.abs(rounded).toFixed(2)}`;
}

function formatVectorReadout(vector: JoystickVector, rotation: boolean): string {
  const [x, y] = rotation ? ["rx", "ry"] : ["x", "y"];
  return `${x} ${formatSignedValue(vector.x)}  ${y} ${formatSignedValue(vector.y)}`;
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
  // A fine step keeps its digits only when they carry one: 0.165 stays, 0.150 reads 0.15 (design 1b).
  const formatted = value.toFixed(resolveDecimalPlaces(step)).replace(/(\.\d\d\d*?)0+$/, "$1");
  return unit ? `${formatted} ${unit}` : formatted;
}

import {
  clamp,
  createWidgetActionIntent,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  hidesTitle,
  localizeOperatorText,
  normalizeWidgetSettings,
  readNumberList,
  readStringList,
  resolveTitlePlacement,
} from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { bindArrowToWord } from "./JoystickPrimitive";
import { resolveStepTargetPreset, STEP_TARGET_HINTS } from "./motor-preset-hints";
import { formatSignedValue, resolveDecimalPlaces } from "./readouts";
import type { WidgetRendererProps } from "./types";
import { useSettledAnnouncement } from "./use-settled-announcement";

const SLIDER_LATCH_EXPIRY_MS = 15000;
const SLIDER_STEP_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);

export function SliderWidget({
  controlState,
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
  // Validation refuses min >= max, but an invalid pair falls back to the raw settings above and reaches
  // the track: equal bounds divide by zero and leave the thumb unplaceable, reversed ones publish an
  // aria range that reads backwards. Keep a usable span whatever was authored.
  const authoredMax = getNumberSetting(sliderSettings, "max", 1);
  const max = authoredMax > min ? authoredMax : min + 1;
  const step = getNumberSetting(sliderSettings, "step", 0.01);
  const direction = getStringSetting(sliderSettings, "direction", "vertical");
  const returnToCenter = getBooleanSetting(sliderSettings, "returnToCenter", false);
  const showDetails = getBooleanSetting(sliderSettings, "show_details", false);
  const intentLabel = getStringSetting(sliderSettings, "intent_label", "");
  const unit = getStringSetting(sliderSettings, "unit", "");
  const configuredValue = getNumberSetting(sliderSettings, "value", 0);
  const defaultValue = clamp(returnToCenter ? 0 : configuredValue, min, max);
  const [currentValue, setCurrentValue] = useState(defaultValue);
  const readBackValue = controlState?.value;
  // A parameter slider opens on what the node holds, not on the seed's guess.
  useEffect(() => {
    if (typeof readBackValue === "number" && Number.isFinite(readBackValue)) {
      setCurrentValue(clamp(readBackValue, min, max));
    }
  }, [readBackValue, min, max]);
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
        {hidesTitle(descriptor.widget.settings) ? null : (
          <header className="bloom-control-header">
            <strong>
              {descriptor.widget.title}
              {/* The space is read: without it a screen reader says "Max speedm/s". */}
              {unit ? <small className="bloom-control-unit"> {unit}</small> : null}
            </strong>
            <span>{STEP_TARGET_HINTS[stepPreset]}</span>
          </header>
        )}
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
        {hidesTitle(descriptor.widget.settings) ? null : (
          <header className="bloom-widget-head">
            <strong>{descriptor.widget.title}</strong>
            <output className="bloom-widget-readout">{formattedValue}</output>
          </header>
        )}
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
        {hidesTitle(descriptor.widget.settings) ? null : (
          <header className="bloom-widget-head">
            <strong>{descriptor.widget.title}</strong>
            <output aria-live="polite" className="bloom-widget-readout">
              {formattedValue}
            </output>
          </header>
        )}
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
      {placement === "above" && !hidesTitle(descriptor.widget.settings) ? (
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
  // Height reads Down and Up however the slider is laid out; other axes follow the orientation.
  const binding = settings.runtime_binding as { axis_mapping?: { value?: { component?: string } } } | undefined;
  const drivesHeight = binding?.axis_mapping?.value?.component === "linear_z";
  const fallback =
    orientation === "vertical" || drivesHeight
      ? { negative: "▼ Down", positive: "▲ Up" }
      : { negative: "◀ Left", positive: "Right ▶" };
  return {
    negative: typeof labels.negative === "string" && labels.negative ? labels.negative : fallback.negative,
    positive: typeof labels.positive === "string" && labels.positive ? labels.positive : fallback.positive,
  };
}

function formatLimitValue(value: number, unit: string): string {
  return unit ? `${value.toFixed(2)} ${unit}` : value.toFixed(2);
}

function formatSliderValue(value: number, step: number, unit: string): string {
  // A fine step keeps its digits only when they carry one: 0.165 stays, 0.150 reads 0.15 (design 1b).
  const formatted = value.toFixed(resolveDecimalPlaces(step)).replace(/(\.\d\d\d*?)0+$/, "$1");
  return unit ? `${formatted} ${unit}` : formatted;
}

import { clamp, createWidgetActionIntent, getBooleanSetting, getStringSetting } from "@bloom/widgets";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { resolveStepTargetPreset } from "./motor-preset-hints";
import { rendererStrings } from "./renderer-strings";
import type { WidgetRendererProps } from "./types";

export function GesturePadWidget({ descriptor, language, motorPreset, onActionIntent }: WidgetRendererProps) {
  const text = rendererStrings(language);
  // Scan and dwell arrive as a click, which set nothing: the pad was lit and did not answer.
  const stepPreset = resolveStepTargetPreset(motorPreset);
  const angleLabel = getStringSetting(descriptor.widget.settings, "angleLabel", "Angle");
  const powerLabel = getStringSetting(descriptor.widget.settings, "powerLabel", "Power");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const [gesture, setGesture] = useState({ angleDegrees: 45, power: 0.5 });

  const lastSentRef = useRef(gesture);
  const draggingRef = useRef(false);
  // Arrows pressed on the pad: a key-up from focus arriving mid-press is not a gesture.
  const heldArrowsRef = useRef(new Set<string>());
  const emitGesture = (nextGesture: { angleDegrees: number; power: number }) => {
    setGesture(nextGesture);
    lastSentRef.current = nextGesture;
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-gesture", value: nextGesture }));
  };

  // Drawn while the finger moves, sent when it lifts: one publish per pointer move spent the HTTP rate limit
  // in seconds, and every other command on the screen came back 429.
  const handlePointerGesture = (event: PointerEvent<HTMLButtonElement>) => {
    setGesture(resolveGestureFromPointer(event));
  };

  // Arrows move the drawn gesture and send it when the key comes up: a held arrow repeated a publish per repeat.
  const handleKeyboardGesture = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nextGesture = resolveGestureFromKeyboard(event, gesture);
    if (!nextGesture) {
      return;
    }
    event.preventDefault();
    heldArrowsRef.current.add(event.key);
    setGesture(nextGesture);
  };
  const cancelDrag = () => {
    // A drag the browser took away was never sent; show what the robot last got.
    if (draggingRef.current) {
      draggingRef.current = false;
      setGesture(lastSentRef.current);
    }
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
        onClick={(event) => {
          // A switch, dwell or Enter press sends the gesture shown; a finger already sent it on the way down.
          if (event.detail === 0) {
            emitGesture(gesture);
          }
        }}
        onKeyDown={handleKeyboardGesture}
        onBlur={() => heldArrowsRef.current.clear()}
        onKeyUp={(event) => {
          if (heldArrowsRef.current.delete(event.key)) {
            emitGesture(gesture);
          }
        }}
        onLostPointerCapture={cancelDrag}
        onPointerCancel={cancelDrag}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          handlePointerGesture(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            handlePointerGesture(event);
          }
        }}
        onPointerUp={(event) => {
          // Only a drag that started here: a press begun elsewhere and released over the pad drew nothing.
          if (draggingRef.current) {
            draggingRef.current = false;
            emitGesture(resolveGestureFromPointer(event));
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
      {stepPreset ? (
        <fieldset aria-label={text.stepControls(descriptor.widget.title)} className="bloom-gesture-steps">
          {(
            [
              [`${angleLabel} −`, { angleDegrees: Math.max(0, angle - 15) }],
              [`${angleLabel} +`, { angleDegrees: Math.min(180, angle + 15) }],
              [`${powerLabel} −`, { power: Math.max(0, Number((gesture.power - 0.1).toFixed(2))) }],
              [`${powerLabel} +`, { power: Math.min(1, Number((gesture.power + 0.1).toFixed(2))) }],
            ] as const
          ).map(([label, change]) => (
            <button
              className="bloom-slider-step-button"
              key={label}
              onClick={() => emitGesture({ ...gesture, ...change })}
              type="button"
            >
              {label}
            </button>
          ))}
        </fieldset>
      ) : null}
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

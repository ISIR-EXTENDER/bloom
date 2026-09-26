import {
  clamp,
  createWidgetActionIntent,
  getBooleanSetting,
  getNumberSetting,
  hidesTitle,
  normalizeWidgetSettings,
  resolveJoystickControlSize,
  resolveTitlePlacement,
  resolveWidgetDestination,
} from "@bloom/widgets";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";
import { LatchCountdownNotice } from "./latch-countdown-notice";
import { resolveStepTargetPreset, type StepTargetPreset } from "./motor-preset-hints";
import { formatSignedValue } from "./readouts";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import { resolveJoystickBinding } from "./settings-readers";
import type { WidgetRendererProps } from "./types";
import { useLatchCountdown } from "./use-latch-countdown";
import { useSettledAnnouncement } from "./use-settled-announcement";

const STEP_ZONE_INCREMENT = 0.25;

export function JoystickWidget({
  conditioning,
  descriptor,
  language,
  motorPreset,
  neutralRevision,
  onActionIntent,
}: WidgetRendererProps) {
  const text = rendererStrings(language);
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
  const latch = useLatchCountdown(vectorIsHeld, inputRevision, () => emitHeldVector({ x: 0, y: 0 }));
  const latchCountdown = <LatchCountdownNotice countdown={latch} text={text} />;

  if (stepPreset) {
    return (
      <StepZoneJoystick
        currentVector={currentVector}
        descriptor={descriptor}
        labels={binding.labels}
        latchCountdown={latchCountdown}
        motorPreset={stepPreset}
        onVector={emitHeldVector}
        showDetails={showDetails}
        text={text}
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
      {placement === "above" && !hidesTitle(descriptor.widget.settings) ? (
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
            aria-label={text.zero(descriptor.widget.title)}
            className="bloom-latch-zero"
            disabled={!vectorIsHeld}
            onClick={() => emitHeldVector({ x: 0, y: 0 })}
            type="button"
          >
            {text.zeroButton}
          </button>
        ) : null}
        {latchCountdown}
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
  latchCountdown,
  motorPreset,
  onVector,
  showDetails,
  text,
}: {
  currentVector: JoystickVector;
  descriptor: WidgetRendererProps["descriptor"];
  labels: { bottom: string; left: string; right: string; top: string };
  latchCountdown: ReactNode;
  motorPreset: StepTargetPreset;
  onVector: (vector: JoystickVector) => void;
  showDetails: boolean;
  text: RendererStrings;
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
        <span>{text.stepHints[motorPreset]}</span>
      </header>
      {latchCountdown}
      <fieldset aria-label={text.stepControls(descriptor.widget.title)} className="bloom-step-zones">
        <button
          aria-label={text.oneStep(labels.top)}
          className="bloom-step-zone"
          data-zone="top"
          onClick={() => stepBy(0, STEP_ZONE_INCREMENT)}
          type="button"
        >
          {labels.top}
        </button>
        <button
          aria-label={text.oneStep(labels.left)}
          className="bloom-step-zone"
          data-zone="left"
          onClick={() => stepBy(-STEP_ZONE_INCREMENT, 0)}
          type="button"
        >
          {labels.left}
        </button>
        <button
          aria-label={text.stop(descriptor.widget.title)}
          className="bloom-step-zone"
          data-zone="stop"
          onClick={() => onVector({ x: 0, y: 0 })}
          type="button"
        >
          0
        </button>
        <button
          aria-label={text.oneStep(labels.right)}
          className="bloom-step-zone"
          data-zone="right"
          onClick={() => stepBy(STEP_ZONE_INCREMENT, 0)}
          type="button"
        >
          {labels.right}
        </button>
        <button
          aria-label={text.oneStep(labels.bottom)}
          className="bloom-step-zone"
          data-zone="bottom"
          onClick={() => stepBy(0, -STEP_ZONE_INCREMENT)}
          type="button"
        >
          {labels.bottom}
        </button>
      </fieldset>
      <output aria-live="polite" className="bloom-control-vector-readout">
        <span>x {currentVector.x.toFixed(2)}</span> <span>y {currentVector.y.toFixed(2)}</span>
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

function formatVectorReadout(vector: JoystickVector, rotation: boolean): string {
  const [x, y] = rotation ? ["rx", "ry"] : ["x", "y"];
  return `${x} ${formatSignedValue(vector.x)}  ${y} ${formatSignedValue(vector.y)}`;
}

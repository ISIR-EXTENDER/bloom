import { createWidgetActionIntent, type WidgetActionIntent } from "@bloom/widgets";

const MOMENTARY_HOLD_EXPIRY_MS = 15000;

import { type PointerEvent, useEffect, useRef, useState } from "react";
import { getBooleanSetting, getNumberSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function CommandLikeWidget({ conditioning, controlState, descriptor, onActionIntent }: WidgetRendererProps) {
  const allowActivation = useRepeatGuard(conditioning?.repeatGuardMs);
  const buttonLabel = getStringSetting(descriptor.widget.settings, "button_label", "") || descriptor.widget.title;
  const pressedLabel = getStringSetting(descriptor.widget.settings, "pressed_label", buttonLabel);
  const releasedLabel = getStringSetting(descriptor.widget.settings, "released_label", buttonLabel);
  const actionLabel = getStringSetting(descriptor.widget.settings, "action_label", "");
  const command = getStringSetting(descriptor.widget.settings, "command", "");
  const momentary = getBooleanSetting(descriptor.widget.settings, "momentary", false);
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const messageType = getStringSetting(descriptor.widget.settings, "messageType", "");
  const variant = getStringSetting(descriptor.widget.settings, "variant", "");
  const confirmPress = getBooleanSetting(descriptor.widget.settings, "confirm_press", false);
  const confirmLabel = getStringSetting(descriptor.widget.settings, "confirm_label", "Confirm?");
  const confirmTimeoutSeconds = getNumberSetting(descriptor.widget.settings, "confirm_timeout_seconds", 5);
  // Only set for latching mode buttons. The manager never reports its mode, so
  // this says "this is what we last asked for", never "the arm is in this mode".
  const selection = controlState?.selection;
  const isSelected = selection === "selected";
  const disabled = controlState?.disabled === true;
  const disabledReason = controlState?.disabledReason;
  const disabledReasonId = disabledReason ? `${descriptor.widget.id}-disabled-reason` : undefined;
  const isMomentaryPressedRef = useRef(false);
  const [isMomentaryPressed, setIsMomentaryPressed] = useState(false);
  const [isMomentaryLatched, setIsMomentaryLatched] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const visibleButtonLabel = momentary
    ? isMomentaryPressed
      ? pressedLabel
      : releasedLabel
    : isArmed
      ? confirmLabel
      : buttonLabel;

  // An armed button disarms itself, so a half-finished press cannot be
  // completed minutes later by someone who did not arm it.
  useEffect(() => {
    if (!isArmed || confirmTimeoutSeconds <= 0) {
      return;
    }
    const timer = setTimeout(() => setIsArmed(false), confirmTimeoutSeconds * 1000);
    return () => clearTimeout(timer);
  }, [confirmTimeoutSeconds, isArmed]);

  // A held mode must be let go of whenever the operator can no longer do it
  // themselves: after the attention window, when the control is disabled, and
  // when it unmounts (Settings, a screen change). Otherwise the manager stays in
  // snake mode after the button that requested it is gone.
  const releaseHeldRef = useRef(() => {});
  useEffect(() => {
    if (!isMomentaryLatched) {
      return;
    }
    const timer = setTimeout(() => releaseHeldRef.current(), MOMENTARY_HOLD_EXPIRY_MS);
    return () => clearTimeout(timer);
  }, [isMomentaryLatched]);
  useEffect(() => {
    if (disabled) {
      releaseHeldRef.current();
    }
  }, [disabled]);
  useEffect(() => () => releaseHeldRef.current(), []);

  const handlePress = () => {
    if (disabled) {
      return;
    }
    if (!allowActivation()) {
      return;
    }
    if (confirmPress && !isArmed) {
      setIsArmed(true);
      return;
    }
    setIsArmed(false);
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "press" }));
  };
  const handleMomentaryPress = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || isMomentaryPressedRef.current) {
      return;
    }
    setIsMomentaryLatched(false);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    isMomentaryPressedRef.current = true;
    setIsMomentaryPressed(true);
    publishMomentaryPayload("payload");
  };
  // Scanning, dwell and the keyboard all activate through click(), which a
  // pointer-only hold cannot serve: the hold becomes a latch, with the same
  // attention expiry the stepped controls use.
  const handleMomentaryActivation = (event: { detail: number }) => {
    if (disabled || event.detail !== 0) {
      return;
    }
    if (isMomentaryPressedRef.current) {
      releaseMomentary();
      return;
    }
    if (!allowActivation()) {
      return;
    }
    isMomentaryPressedRef.current = true;
    setIsMomentaryPressed(true);
    setIsMomentaryLatched(true);
    publishMomentaryPayload("payload");
  };
  const releaseMomentary = () => {
    isMomentaryPressedRef.current = false;
    setIsMomentaryPressed(false);
    setIsMomentaryLatched(false);
    publishMomentaryPayload("releasedPayload");
  };
  releaseHeldRef.current = () => {
    if (isMomentaryPressedRef.current) {
      releaseMomentary();
    }
  };
  const handleMomentaryRelease = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isMomentaryPressedRef.current) {
      return;
    }
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId) &&
      typeof event.currentTarget.releasePointerCapture === "function"
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseMomentary();
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
      ...(payloadKey === "releasedPayload" ? { release: true } : {}),
    } satisfies WidgetActionIntent);
  };

  return (
    <div
      className="bloom-action-widget"
      data-momentary={momentary ? "true" : "false"}
      data-selection={selection}
      data-show-details={showDetails ? "true" : "false"}
      data-variant={variant || undefined}
    >
      <strong>{descriptor.widget.title}</strong>
      <button
        aria-describedby={disabledReasonId}
        aria-label={`${
          selection ? `${visibleButtonLabel}: ${isSelected ? "requested" : "not requested"}` : visibleButtonLabel
        }${disabledReason ? `. ${disabledReason}` : ""}`}
        aria-pressed={momentary ? isMomentaryPressed : selection ? isSelected : undefined}
        className="bloom-command-button"
        data-armed={isArmed ? "true" : undefined}
        data-selected={isSelected ? "true" : undefined}
        data-confirm-press={confirmPress ? "true" : undefined}
        data-momentary={momentary ? "true" : "false"}
        data-pressed={momentary && isMomentaryPressed ? "true" : undefined}
        disabled={disabled}
        onClick={momentary ? handleMomentaryActivation : handlePress}
        onPointerCancel={momentary ? handleMomentaryRelease : undefined}
        onPointerDown={momentary ? handleMomentaryPress : undefined}
        onPointerLeave={momentary ? handleMomentaryRelease : undefined}
        onPointerUp={momentary ? handleMomentaryRelease : undefined}
        title={disabledReason}
        type="button"
      >
        <span>{visibleButtonLabel}</span>
        {disabledReason ? (
          <small className="bloom-command-button-disabled-reason" id={disabledReasonId}>
            {disabledReason}
          </small>
        ) : null}
      </button>
      {showDetails && (actionLabel || command) ? (
        <span>{isSelected ? `Last requested \u00b7 ${actionLabel || command}` : actionLabel || command}</span>
      ) : null}
    </div>
  );
}

export function LabelWidget({ descriptor }: WidgetRendererProps) {
  const text = getStringSetting(descriptor.widget.settings, "text", descriptor.widget.title);
  const fontSize = getNumberSetting(descriptor.widget.settings, "fontSize", 20);
  const align = getLabelAlignment(getStringSetting(descriptor.widget.settings, "align", "left"));
  const variant = getStringSetting(descriptor.widget.settings, "variant", "");

  return (
    <div className="bloom-label-widget" data-align={align} data-variant={variant || undefined} style={{ fontSize }}>
      <span>{text}</span>
    </div>
  );
}

/** Drops a repeat activation of the same control inside the guard window. */
export function useRepeatGuard(repeatGuardMs: number | undefined) {
  const lastFiredRef = useRef(0);
  return () => {
    if (!repeatGuardMs) {
      return true;
    }
    const now = Date.now();
    if (now - lastFiredRef.current < repeatGuardMs) {
      return false;
    }
    lastFiredRef.current = now;
    return true;
  };
}

export function ToggleWidget({ conditioning, controlState, descriptor, onActionIntent }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const offLabel = getStringSetting(descriptor.widget.settings, "offLabel", "Inactive");
  const onLabel = getStringSetting(descriptor.widget.settings, "onLabel", "Active");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const variant = getStringSetting(descriptor.widget.settings, "variant", "");
  const [localIsOn, setLocalIsOn] = useState(getBooleanSetting(descriptor.widget.settings, "initialValue", false));
  const allowToggle = useRepeatGuard(conditioning?.repeatGuardMs);
  const controlledToggleState = controlState?.toggleState;
  const isOn = controlledToggleState ? controlledToggleState === "on" : localIsOn;
  const stateLabel = isOn ? onLabel : offLabel;
  const [isPending, setIsPending] = useState(false);

  const handleToggle = async () => {
    if (isPending || !allowToggle()) {
      return;
    }
    const nextState = isOn ? "off" : "on";
    if (!onActionIntent) {
      setLocalIsOn(nextState === "on");
      return;
    }

    setIsPending(true);
    try {
      const outcome = await onActionIntent(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" }));
      if (!controlledToggleState && (outcome === undefined || outcome.accepted)) {
        setLocalIsOn(nextState === "on");
      }
    } catch {
      // The runtime shell owns visible error reporting. Keep the last
      // acknowledged state when an embedding handler rejects unexpectedly.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bloom-toggle-widget" data-state={isOn ? "active" : "inactive"} data-variant={variant || undefined}>
      <strong>{descriptor.widget.title}</strong>
      <button
        aria-pressed={isOn}
        aria-label={`${descriptor.widget.title}: ${stateLabel}`}
        aria-busy={isPending}
        className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
        disabled={isPending}
        onClick={handleToggle}
        type="button"
      >
        {variant === "mode-segmented" ? (
          <>
            <span className="bloom-toggle-segment" data-active={!isOn ? "true" : "false"}>
              {offLabel}
            </span>
            <span className="bloom-toggle-segment" data-active={isOn ? "true" : "false"}>
              {onLabel}
            </span>
          </>
        ) : (
          stateLabel
        )}
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

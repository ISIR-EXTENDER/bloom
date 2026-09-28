import {
  createWidgetActionIntent,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  hidesTitle,
  localizeOperatorText,
  type WidgetActionIntent,
} from "@bloom/widgets";

import { type PointerEvent, useEffect, useId, useRef, useState } from "react";
import {
  cancelPending,
  claimTarget,
  type DesiredSnapshot,
  forgetSettled,
  setDesired,
  useDesiredState,
} from "./desired-state";
import { LatchCountdownNotice } from "./latch-countdown-notice";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import type { WidgetRendererProps } from "./types";
import { useLatchCountdown } from "./use-latch-countdown";

/** A confirming press closer than this to the arming one is the same gesture, not a second decision. */
const CONFIRM_SETTLE_MS = 600;
/** The visual servoing switch: while on, the servo node moves the arm, so a suspend or STOP turns it off. */
export const VISUAL_SERVOING_SWITCH_TOPIC = "/ui/visual_servoing/on";
const MODE_REQUEST_TOPIC = "/mode_request";

export function CommandLikeWidget({
  conditioning,
  controlState,
  descriptor,
  language,
  neutralRevision,
  onActionIntent,
}: WidgetRendererProps) {
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
  // An unavailable widget's frame already states the reason; saying it twice only grows the card.
  const showsDisabledReason = Boolean(disabledReason) && controlState?.unavailable !== true;
  const disabledReasonId = showsDisabledReason ? `${descriptor.widget.id}-disabled-reason` : undefined;
  // A latched mode button asks for a state, so it keeps asking until the robot takes it (ADR 0141).
  const reconcilesLatch = !momentary && !confirmPress && (selection !== undefined || topic === MODE_REQUEST_TOPIC);
  const widgetId = descriptor.widget.id;
  const target = topic || `widget:${widgetId}`;
  const desired = useDesiredState(widgetId, target, onActionIntent);
  const isMomentaryPressedRef = useRef(false);
  // Only the pointer that began a hold may end it; a latch (click, scan, dwell) has none.
  const holdPointerIdRef = useRef<number | null>(null);
  const [isMomentaryHeld, setIsMomentaryHeld] = useState(false);
  const [isMomentaryLatched, setIsMomentaryLatched] = useState(false);
  const isMomentaryPressed = momentary && desired ? desired.value === "pressed" : isMomentaryHeld;
  const [isArmed, setIsArmed] = useState(false);
  const armedAtRef = useRef(0);
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
  const latch = useLatchCountdown(isMomentaryLatched, null, () => releaseHeldRef.current());
  // An armed Go home must not survive a disable, a STOP or a suspend either.
  // A mode still being asked for is not asked again after a STOP or a suspend.
  const cancelPendingRef = useRef(() => {});
  cancelPendingRef.current = () => {
    if (reconcilesLatch) {
      cancelPending(widgetId, target);
    }
  };
  useEffect(() => {
    if (disabled) {
      setIsArmed(false);
      releaseHeldRef.current();
      cancelPendingRef.current();
    }
  }, [disabled]);
  useEffect(() => () => releaseHeldRef.current(), []);
  const lastNeutralRevisionRef = useRef(neutralRevision);
  useEffect(() => {
    if (neutralRevision === lastNeutralRevisionRef.current) {
      return;
    }
    lastNeutralRevisionRef.current = neutralRevision;
    setIsArmed(false);
    releaseHeldRef.current();
    cancelPendingRef.current();
  }, [neutralRevision]);
  // A refused press was not applied: the hold ends there, with nothing to release.
  const pressRefused = momentary && desired?.refused === true && desired.value !== "pressed";
  useEffect(() => {
    if (pressRefused && isMomentaryPressedRef.current) {
      holdPointerIdRef.current = null;
      isMomentaryPressedRef.current = false;
      setIsMomentaryHeld(false);
      setIsMomentaryLatched(false);
    }
  }, [pressRefused]);

  const handlePress = () => {
    if (disabled) {
      return;
    }
    if (!allowActivation()) {
      return;
    }
    if (confirmPress && !isArmed) {
      armedAtRef.current = Date.now();
      setIsArmed(true);
      return;
    }
    // The second press is a second decision: a double tap, a bouncing switch or a held Enter confirmed the move
    // within a few milliseconds of arming it.
    if (confirmPress && Date.now() - armedAtRef.current < CONFIRM_SETTLE_MS) {
      return;
    }
    setIsArmed(false);
    const intent = createWidgetActionIntent(descriptor.widget, { type: "press" });
    if (intent.type === "topic-publish" && reconcilesLatch && onActionIntent) {
      setDesired({ widgetId, target: intent.topic, value: "requested", engage: true, intent, send: onActionIntent });
      return;
    }
    // A one-shot publish is the newest act on its topic: a pending retry there must not undo it.
    if (intent.type === "topic-publish") {
      claimTarget(intent.topic);
    }
    onActionIntent?.(intent);
  };
  const handleMomentaryPress = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    if (isMomentaryPressedRef.current) {
      // A latch from scan, dwell or keyboard: the touch or mouse that comes to end it releases on its up.
      if (holdPointerIdRef.current === null) {
        holdPointerIdRef.current = event.pointerId;
      }
      return;
    }
    setIsMomentaryLatched(false);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    holdPointerIdRef.current = event.pointerId;
    isMomentaryPressedRef.current = true;
    setIsMomentaryHeld(true);
    publishMomentary("pressed");
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
    holdPointerIdRef.current = null;
    isMomentaryPressedRef.current = true;
    setIsMomentaryHeld(true);
    setIsMomentaryLatched(true);
    publishMomentary("pressed");
  };
  const releaseMomentary = () => {
    holdPointerIdRef.current = null;
    isMomentaryPressedRef.current = false;
    setIsMomentaryHeld(false);
    setIsMomentaryLatched(false);
    publishMomentary("released");
  };
  releaseHeldRef.current = () => {
    if (isMomentaryPressedRef.current) {
      releaseMomentary();
    }
  };
  const handleMomentaryRelease = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isMomentaryPressedRef.current || holdPointerIdRef.current !== event.pointerId) {
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
  // Press and release are absolute payloads, so each replaces the other at once; the server orders them.
  const publishMomentary = (value: "pressed" | "released") => {
    if (!topic || !messageType || !onActionIntent) {
      return;
    }
    const payloadKey = value === "pressed" ? "payload" : "releasedPayload";
    setDesired({
      widgetId,
      target: topic,
      value,
      engage: value === "pressed",
      intent: {
        type: "topic-publish",
        widgetId,
        widgetKind: descriptor.widget.kind,
        topic,
        messageType,
        payload: resolveMomentaryPayload(topic, payloadKey, descriptor.widget.settings[payloadKey]),
        ...(value === "released" ? { release: true } : {}),
      } satisfies WidgetActionIntent,
      send: onActionIntent,
    });
  };

  const layout = getBooleanSetting(descriptor.widget.settings, "hide_title", false) ? "bare" : "card";
  const showsTitle =
    layout === "card" && descriptor.widget.title.trim().toLowerCase() !== buttonLabel.trim().toLowerCase();
  const detail = actionLabel || command;
  const authoredHint = getStringSetting(descriptor.widget.settings, "hint", "");
  // A timeout of zero means the button stays armed until it is pressed again, which is the opposite of
  // what the countdown wording promised on exactly the guard that protects a destructive command.
  const strings = rendererStrings(language);
  const unconfirmed = desired !== null && !desired.confirmed;
  const modeUnconfirmed = selection === "unconfirmed" || (reconcilesLatch && unconfirmed);
  const mark =
    desired?.marked && !desired.confirmed
      ? confirmationMarkText(desired, strings, reconcilesLatch)
      : selection === "unconfirmed"
        ? strings.modeNotConfirmed
        : "";
  const refusal =
    momentary && desired && (desired.refused || (unconfirmed && desired.marked)) ? (desired.detail ?? "") : "";
  const hint = refusal
    ? refusal
    : isArmed
      ? confirmTimeoutSeconds > 0
        ? strings.armedFor(confirmTimeoutSeconds)
        : strings.armedUntilPressed
      : authoredHint
        ? authoredHint
        : showDetails && detail
          ? isSelected
            ? strings.lastRequested(detail)
            : detail
          : "";
  const stateName = mark
    ? strings.notConfirmedName
    : selection
      ? isSelected
        ? strings.requested
        : strings.notRequested
      : "";

  return (
    <div
      className="bloom-action-widget"
      data-armed={isArmed ? "true" : undefined}
      data-confirmed={unconfirmed || modeUnconfirmed ? "false" : undefined}
      data-layout={layout}
      data-momentary={momentary ? "true" : "false"}
      data-pressed={momentary && isMomentaryPressed ? "true" : undefined}
      data-selection={selection}
      data-show-details={showDetails ? "true" : "false"}
      data-variant={variant || undefined}
    >
      <button
        aria-busy={unconfirmed ? true : undefined}
        aria-describedby={disabledReasonId}
        aria-label={`${stateName ? `${visibleButtonLabel}: ${stateName}` : visibleButtonLabel}${
          disabledReason ? `. ${disabledReason}` : ""
        }`}
        aria-pressed={momentary ? isMomentaryPressed : selection ? isSelected : undefined}
        className="bloom-command-button"
        data-armed={isArmed ? "true" : undefined}
        data-confirmed={unconfirmed || modeUnconfirmed ? "false" : undefined}
        data-selected={isSelected ? "true" : undefined}
        data-confirm-press={confirmPress ? "true" : undefined}
        data-momentary={momentary ? "true" : "false"}
        data-pressed={momentary && isMomentaryPressed ? "true" : undefined}
        data-unsupported={controlState?.unsupported ? "true" : undefined}
        disabled={disabled}
        onClick={momentary ? handleMomentaryActivation : handlePress}
        onKeyDown={(event) => {
          // A held Enter or Space repeats the click; one press is one command.
          if (event.repeat && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
          }
        }}
        onPointerCancel={momentary ? handleMomentaryRelease : undefined}
        onPointerDown={momentary ? handleMomentaryPress : undefined}
        onPointerLeave={momentary ? handleMomentaryRelease : undefined}
        onPointerUp={momentary ? handleMomentaryRelease : undefined}
        title={disabledReason}
        type="button"
      >
        {showsTitle ? <span className="bloom-action-title">{descriptor.widget.title}</span> : null}
        <span className="bloom-action-label">{visibleButtonLabel}</span>
        {hint ? <span className="bloom-action-hint">{hint}</span> : null}
        <ConfirmationMark late={Boolean(desired?.late && unconfirmed)} text={mark} />
        {showsDisabledReason ? (
          <small className="bloom-command-button-disabled-reason" id={disabledReasonId}>
            {disabledReason}
          </small>
        ) : null}
      </button>
      <LatchCountdownNotice countdown={latch} text={strings} />
    </div>
  );
}

function confirmationMarkText(desired: DesiredSnapshot, strings: RendererStrings, isMode: boolean): string {
  if (desired.late) {
    return strings.notConfirmedLate;
  }
  return isMode ? strings.modeNotConfirmed : strings.notConfirmed;
}

function ConfirmationMark({ late, text }: { late: boolean; text: string }) {
  return text ? (
    <span className="bloom-confirm-mark" data-late={late ? "true" : undefined}>
      {text}
    </span>
  ) : null;
}

/** A /mode_request hold saved without a release payload let go with {}, which the server refuses: send Neutral. */
function resolveMomentaryPayload(topic: string, payloadKey: "payload" | "releasedPayload", payload: unknown): unknown {
  const missing =
    payload === undefined ||
    payload === null ||
    payload === "" ||
    (typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0);
  return payloadKey === "releasedPayload" && missing && topic === MODE_REQUEST_TOPIC
    ? { data: "geometric/both" }
    : payload;
}

export function LabelWidget({ descriptor }: WidgetRendererProps) {
  const text = getStringSetting(descriptor.widget.settings, "text", descriptor.widget.title);
  const fontSize = getNumberSetting(descriptor.widget.settings, "fontSize", 20);
  const align = getLabelAlignment(getStringSetting(descriptor.widget.settings, "align", "left"));
  const authoredVariant = getStringSetting(descriptor.widget.settings, "variant", "");
  // A 12 px label names a group of controls: uppercase, tracked, never a control itself.
  const variant = authoredVariant || (fontSize <= 12 ? "group" : "");

  return (
    <div
      className="bloom-label-widget"
      data-align={align}
      data-variant={variant || undefined}
      style={variant === "group" ? undefined : { fontSize }}
    >
      <span>{text}</span>
    </div>
  );
}

/** Drops a repeat activation of the same control inside the guard window. */
function useRepeatGuard(repeatGuardMs: number | undefined) {
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

export function ToggleWidget({
  conditioning,
  controlState,
  descriptor,
  language,
  neutralRevision,
  onActionIntent,
}: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const offLabel = getStringSetting(descriptor.widget.settings, "offLabel", "Inactive");
  const onLabel = getStringSetting(descriptor.widget.settings, "onLabel", "Active");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const variant = getStringSetting(descriptor.widget.settings, "variant", "");
  const widgetId = descriptor.widget.id;
  const target = topic || `widget:${widgetId}`;
  const desired = useDesiredState(widgetId, target, onActionIntent);
  const [localIsOn, setLocalIsOn] = useState(() =>
    desired ? desired.value === "on" : getBooleanSetting(descriptor.widget.settings, "initialValue", false),
  );
  const readBackValue = controlState?.value;
  useEffect(() => {
    if (typeof readBackValue === "boolean") {
      setLocalIsOn(readBackValue);
      forgetSettled(widgetId, target);
    }
  }, [readBackValue, target, widgetId]);
  const allowToggle = useRepeatGuard(conditioning?.repeatGuardMs);
  const controlledToggleState = controlState?.toggleState;
  const unconfirmed = desired !== null && !desired.confirmed;
  // Unconfirmed shows what was asked for, never the old state (ADR 0141).
  const isOn = unconfirmed
    ? desired.value === "on"
    : controlledToggleState
      ? controlledToggleState === "on"
      : desired && desired.value !== null
        ? desired.value === "on"
        : localIsOn;
  const stateLabel = isOn ? onLabel : offLabel;
  const stateTextId = useId();
  const strings = rendererStrings(language);
  const isServoSwitch = topic === VISUAL_SERVOING_SWITCH_TOPIC;
  const [isPending, setIsPending] = useState(false);

  const requestState = (nextState: "off" | "on", release: boolean): boolean => {
    if (!onActionIntent) {
      return false;
    }
    const intent = createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" });
    const reconciles =
      intent.type === "topic-publish" || (intent.type === "toggle-state" && intent.runtimeBinding !== undefined);
    if (!reconciles) {
      return false;
    }
    setDesired({
      widgetId,
      target,
      value: nextState,
      engage: nextState === "on",
      // Marked a release so the STOP and hold gates let a switch-off through.
      intent: release && intent.type === "topic-publish" ? { ...intent, release: true } : intent,
      send: onActionIntent,
    });
    return true;
  };
  const switchOffServoRef = useRef(() => {});
  switchOffServoRef.current = () => {
    if (isServoSwitch && (isOn || desired?.value === "on")) {
      requestState("off", true);
    }
  };
  // A suspend or STOP cancels an On still being asked for; the servo switch turns off instead.
  const settleForSuspendRef = useRef(() => {});
  settleForSuspendRef.current = () => {
    switchOffServoRef.current();
    cancelPending(widgetId, target);
  };
  const lastNeutralRevisionRef = useRef(neutralRevision);
  useEffect(() => {
    if (neutralRevision === lastNeutralRevisionRef.current) {
      return;
    }
    lastNeutralRevisionRef.current = neutralRevision;
    settleForSuspendRef.current();
  }, [neutralRevision]);
  const disabled = controlState?.disabled === true;
  useEffect(() => {
    if (disabled) {
      settleForSuspendRef.current();
    }
  }, [disabled]);
  // Settings, the tour and a screen change unmount the canvas before their suspend lands here.
  useEffect(() => () => switchOffServoRef.current(), []);

  const handleToggle = async () => {
    if (isPending || !allowToggle()) {
      return;
    }
    const nextState = isOn ? "off" : "on";
    if (!onActionIntent) {
      setLocalIsOn(nextState === "on");
      return;
    }
    if (requestState(nextState, isServoSwitch && nextState === "off")) {
      return;
    }
    // A local toggle with nothing on the robot to reconcile: one send, applied if accepted.
    setIsPending(true);
    let accepted = false;
    try {
      const outcome = await onActionIntent(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" }));
      accepted = outcome === undefined || outcome.accepted;
    } catch {
      // The runtime shell owns visible error reporting; a rejected publish counts as refused.
    } finally {
      setIsPending(false);
    }
    if (!controlledToggleState && accepted) {
      setLocalIsOn(nextState === "on");
    }
  };

  const onStateLabel = getStringSetting(descriptor.widget.settings, "onStateLabel", "");
  const offStateLabel = getStringSetting(descriptor.widget.settings, "offStateLabel", "");
  const commandedState = isOn ? onStateLabel : offStateLabel;
  const stateText = commandedState
    ? `${localizeOperatorText("commanded", language)}${language === "fr" ? " : " : ": "}${commandedState}`
    : "";
  const inline = getStringSetting(descriptor.widget.settings, "layout", "") === "inline";
  // With state labels the button words are verbs ("Open gripper"): "pressed" would contradict the commanded state.
  const labelsAreActions = Boolean(onStateLabel || offStateLabel);
  const marked = unconfirmed && desired.marked;
  const accessibleName = `${descriptor.widget.title}: ${stateLabel}${marked ? `, ${strings.notConfirmedName}` : ""}`;
  const mark = (
    <ConfirmationMark
      late={Boolean(marked && desired?.late)}
      text={marked && desired ? confirmationMarkText(desired, strings, false) : ""}
    />
  );

  if (variant === "mode-segmented") {
    return (
      <div
        className="bloom-toggle-widget"
        data-confirmed={unconfirmed ? "false" : undefined}
        data-state={isOn ? "active" : "inactive"}
        data-variant={variant}
      >
        <strong className="bloom-toggle-title">{descriptor.widget.title}</strong>
        <button
          aria-pressed={isOn}
          aria-label={accessibleName}
          aria-busy={isPending || unconfirmed}
          className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
          data-confirmed={unconfirmed ? "false" : undefined}
          disabled={isPending}
          onClick={handleToggle}
          type="button"
        >
          <span className="bloom-toggle-segment" data-active={!isOn ? "true" : "false"}>
            {offLabel}
          </span>
          <span className="bloom-toggle-segment" data-active={isOn ? "true" : "false"}>
            {onLabel}
          </span>
        </button>
        {mark}
      </div>
    );
  }

  return (
    <div
      className="bloom-toggle-widget bloom-info-card"
      data-confirmed={unconfirmed ? "false" : undefined}
      data-layout={inline ? "inline" : "stacked"}
      data-narrow={descriptor.widget.layout.width < 260 ? "true" : undefined}
      data-state={isOn ? "active" : "inactive"}
    >
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-widget-head bloom-toggle-head">
          <strong>{descriptor.widget.title}</strong>
          {stateText ? (
            <span className="bloom-toggle-state" id={stateTextId}>
              {stateText}
            </span>
          ) : null}
        </header>
      )}
      <button
        aria-describedby={stateText ? stateTextId : undefined}
        aria-pressed={labelsAreActions ? undefined : isOn}
        aria-label={accessibleName}
        aria-busy={isPending || unconfirmed}
        className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
        data-confirmed={unconfirmed ? "false" : undefined}
        disabled={isPending}
        onClick={handleToggle}
        type="button"
      >
        {stateLabel}
      </button>
      {mark}
      {showDetails && topic ? <span className="bloom-widget-topic">{topic}</span> : null}
    </div>
  );
}

function getLabelAlignment(value: string): "center" | "left" | "right" {
  if (value === "center" || value === "right") {
    return value;
  }

  return "left";
}

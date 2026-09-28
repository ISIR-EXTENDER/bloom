import {
  asRecord,
  createWidgetActionIntent,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  hidesTitle,
  localizeOperatorText,
  resolveCommandPayload,
  type WidgetActionIntent,
} from "@bloom/widgets";

import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  actorKey,
  actValueKey,
  cancelPending,
  MODE_REQUEST_TOPIC,
  parameterTarget,
  payloadKey,
  readMomentary,
  readToggle,
  sendOneShot,
  setDesired,
  useTargetState,
  useWidgetJob,
  VISUAL_SERVOING_SWITCH_TOPIC,
} from "./desired-state";
import { LatchCountdownNotice } from "./latch-countdown-notice";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import type { WidgetRendererProps } from "./types";
import { useLatchCountdown } from "./use-latch-countdown";

/** A confirming press closer than this to the arming one is the same gesture, not a second decision. */
const CONFIRM_SETTLE_MS = 600;

/** The visual servoing switch: while on, the servo node moves the arm, so a suspend or STOP turns it off. */
export { VISUAL_SERVOING_SWITCH_TOPIC };

export function CommandLikeWidget({
  conditioning,
  controlState,
  descriptor,
  desiredScope,
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
  // A joint or pose target is a one-shot: it claims the target once, and a retry would move the arm again.
  const reconcilesLatch =
    !momentary &&
    !confirmPress &&
    !isOneShotBehaviour(descriptor.widget.settings) &&
    (selection !== undefined || topic === MODE_REQUEST_TOPIC);
  const widgetId = descriptor.widget.id;
  const target = topic || `widget:${widgetId}`;
  const job = useWidgetJob(widgetId, target, onActionIntent, desiredScope);
  const targetState = useTargetState(target);
  const actor = actorKey(desiredScope ?? "", widgetId);
  const pressKey = momentary ? payloadKey(resolveCommandPayload(descriptor.widget.settings, messageType)) : "";
  const isMomentaryPressedRef = useRef(false);
  // Only the pointer that began a hold may end it; a latch (click, scan, dwell) has none.
  const holdPointerIdRef = useRef<number | null>(null);
  const [isMomentaryHeld, setIsMomentaryHeld] = useState(false);
  const [isMomentaryLatched, setIsMomentaryLatched] = useState(false);
  const momentaryView = momentary ? readMomentary(targetState, actor, pressKey, isMomentaryHeld) : null;
  const isMomentaryPressed = momentary && (momentaryView?.pressed ?? isMomentaryHeld);
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
      cancelPending(widgetId, target, desiredScope);
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
  const pressRefused = momentary && job?.refused === true && job.value === "pressed";
  useEffect(() => {
    if (pressRefused && isMomentaryPressedRef.current) {
      holdPointerIdRef.current = null;
      isMomentaryPressedRef.current = false;
      setIsMomentaryHeld(false);
      setIsMomentaryLatched(false);
    }
  }, [pressRefused]);
  // A newer act of another control (or STOP, or a new session) was applied: the hold ends, and its release would
  // undo that act. A refused one changes nothing, so the release is still owed.
  const holdClaimed =
    momentary && job !== null && targetState.appliedSeq > job.lastActSeq && targetState.appliedBy !== actor;
  useEffect(() => {
    if (holdClaimed && isMomentaryPressedRef.current) {
      holdPointerIdRef.current = null;
      isMomentaryPressedRef.current = false;
      setIsMomentaryHeld(false);
      setIsMomentaryLatched(false);
    }
  }, [holdClaimed]);

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
      setDesired({
        scope: desiredScope,
        widgetId,
        target: intent.topic,
        value: "requested",
        engage: true,
        intent,
        send: onActionIntent,
      });
      return;
    }
    // A one-shot publish is the newest act on its topic: a pending retry there must not undo it.
    if (intent.type === "topic-publish" && onActionIntent) {
      sendOneShot({ scope: desiredScope, widgetId, target: intent.topic, intent, send: onActionIntent });
      return;
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
    setDesired({
      scope: desiredScope,
      widgetId,
      target: topic,
      value,
      engage: value === "pressed",
      momentary: true,
      intent: {
        type: "topic-publish",
        widgetId,
        widgetKind: descriptor.widget.kind,
        topic,
        messageType,
        // The press resolves as a one-shot press does: a String hold with no payload sends its command.
        payload:
          value === "pressed"
            ? resolveCommandPayload(descriptor.widget.settings, messageType)
            : resolveReleasedPayload(topic, descriptor.widget.settings.releasedPayload),
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
  // Only this control's own unanswered act marks it; the mode highlight says the rest.
  // A hold nothing on its target confirms (its press not applied, retries ended by a newer act) is not clean either.
  const unconfirmed =
    ((momentary || reconcilesLatch) && targetState.pending?.widget === actor) ||
    (momentaryView !== null && !momentaryView.clean && momentaryView.pressed === null && isMomentaryHeld);
  const marked = unconfirmed && (job?.marked === true || targetState.pending?.marked === true);
  const late = marked && job?.late === true;
  const modeUnconfirmed = selection === "unconfirmed" || (reconcilesLatch && unconfirmed);
  const mark = marked
    ? confirmationMarkText(late, strings, reconcilesLatch)
    : selection === "unconfirmed"
      ? strings.modeNotConfirmed
      : "";
  const refusal = momentary && job && (job.refused || marked) ? (job.detail ?? "") : "";
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
        // Busy only while the first send is out: a busy control through the whole retry went unannounced.
        aria-busy={unconfirmed && !marked ? true : undefined}
        aria-describedby={
          [disabledReasonId, mark ? `${descriptor.widget.id}-confirm-mark` : ""].join(" ").trim() || undefined
        }
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
        <ConfirmationMark id={`${descriptor.widget.id}-confirm-mark`} late={late} text={mark} />
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

function confirmationMarkText(late: boolean, strings: RendererStrings, isMode: boolean): string {
  if (late) {
    return strings.notConfirmedLate;
  }
  return isMode ? strings.modeNotConfirmed : strings.notConfirmed;
}

// The button's aria-label hides its content, so the button points here by aria-describedby.
function ConfirmationMark({ id, late, text }: { id: string; late: boolean; text: string }) {
  return text ? (
    <span className="bloom-confirm-mark" data-late={late ? "true" : undefined} id={id}>
      {text}
    </span>
  ) : null;
}

const ONE_SHOT_BEHAVIOUR = /behaviour\/(joint|pose)[_-]target\//i;

function isOneShotBehaviour(settings: Record<string, unknown>): boolean {
  const payload = settings.payload;
  const data = typeof payload === "object" && payload !== null ? asRecord(payload).data : payload;
  return [settings.command, data].some((value) => typeof value === "string" && ONE_SHOT_BEHAVIOUR.test(value));
}

/** A parameter toggle's state lives on its parameter, which a slider or preset on it claims too. */
function resolveToggleTarget(settings: Record<string, unknown>, widgetId: string): string {
  const topic = getStringSetting(settings, "topic", "");
  if (topic) {
    return topic;
  }
  const binding = asRecord(settings.runtime_binding);
  const mapping = asRecord(binding.value_mapping);
  if (binding.adapter === "parameter" && typeof mapping.node === "string" && typeof mapping.parameter === "string") {
    return parameterTarget(mapping.node, mapping.parameter);
  }
  return `widget:${widgetId}`;
}

function toggleValueKey(widget: WidgetRendererProps["descriptor"]["widget"], nextState: "on" | "off"): string | null {
  return actValueKey(createWidgetActionIntent(widget, { nextState, type: "toggle" }));
}

/** A /mode_request hold saved without a release payload let go with {}, which the server refuses: send Neutral. */
function resolveReleasedPayload(topic: string, payload: unknown): unknown {
  const missing =
    payload === undefined ||
    payload === null ||
    payload === "" ||
    (typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0);
  return missing && topic === MODE_REQUEST_TOPIC ? { data: "geometric/both" } : payload;
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
  desiredScope,
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
  const target = resolveToggleTarget(descriptor.widget.settings, widgetId);
  const job = useWidgetJob(widgetId, target, onActionIntent, desiredScope);
  const targetState = useTargetState(target);
  const actor = actorKey(desiredScope ?? "", widgetId);
  // The payloads this toggle sends, which is how it recognises what the robot holds on its target.
  const keys = useMemo(
    () => ({ on: toggleValueKey(descriptor.widget, "on"), off: toggleValueKey(descriptor.widget, "off") }),
    [descriptor.widget],
  );
  const view = readToggle(targetState, keys);
  const [localIsOn, setLocalIsOn] = useState(() =>
    getBooleanSetting(descriptor.widget.settings, "initialValue", false),
  );
  const readBackValue = controlState?.value;
  useEffect(() => {
    if (typeof readBackValue === "boolean") {
      setLocalIsOn(readBackValue);
    }
  }, [readBackValue]);
  const allowToggle = useRepeatGuard(conditioning?.repeatGuardMs);
  const controlledToggleState = controlState?.toggleState;
  // A /mode_request toggle shows the requested mode, which STOP and every other mode control move too.
  const modeDriven = topic === MODE_REQUEST_TOPIC && controlledToggleState !== undefined;
  const pendingAct = modeDriven ? null : view.pending;
  const ownPending = pendingAct?.widget === actor;
  // Nothing newer is out, but what is known is not one of this toggle's payloads, or is not known at all.
  const knownUnclear =
    !modeDriven && !pendingAct && !controlledToggleState && typeof readBackValue !== "boolean" && !view.clean;
  const unconfirmed = modeDriven ? controlState?.toggleUnconfirmed === true : pendingAct !== null || knownUnclear;
  const viewIsOn = view.state === null ? localIsOn : view.state === "on";
  // Unconfirmed shows what was asked for, never the old state (ADR 0141).
  const isOn = modeDriven
    ? controlledToggleState === "on"
    : pendingAct
      ? viewIsOn
      : controlledToggleState
        ? controlledToggleState === "on"
        : typeof readBackValue === "boolean"
          ? readBackValue
          : viewIsOn;
  // The shaping mode is known and is neither of this toggle's: no segment is lit, and it does not say Off.
  const otherMode = modeDriven && controlledToggleState === "other";
  const strings = rendererStrings(language);
  const stateLabel = otherMode ? strings.otherMode : isOn ? onLabel : offLabel;
  const stateTextId = useId();
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
      scope: desiredScope,
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
    if (isServoSwitch && (isOn || (job?.active === true && job.value === "on"))) {
      requestState("off", true);
    }
  };
  // A suspend or STOP cancels an On still being asked for; the servo switch turns off instead.
  const settleForSuspendRef = useRef(() => {});
  settleForSuspendRef.current = () => {
    switchOffServoRef.current();
    cancelPending(widgetId, target, desiredScope);
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
  const commandedState = otherMode ? "" : isOn ? onStateLabel : offStateLabel;
  const stateText = commandedState
    ? `${localizeOperatorText("commanded", language)}${language === "fr" ? " : " : ": "}${commandedState}`
    : "";
  const inline = getStringSetting(descriptor.widget.settings, "layout", "") === "inline";
  // With state labels the button words are verbs ("Open gripper"): "pressed" would contradict the commanded state.
  const labelsAreActions = Boolean(onStateLabel || offStateLabel);
  const marked = modeDriven
    ? unconfirmed
    : pendingAct
      ? pendingAct.marked || (ownPending && job?.marked === true)
      : knownUnclear;
  const late = marked && ownPending && job?.late === true;
  const accessibleName = `${descriptor.widget.title}: ${stateLabel}${marked ? `, ${strings.notConfirmedName}` : ""}`;
  const mark = (
    <ConfirmationMark
      id={`${widgetId}-confirm-mark`}
      late={late}
      text={
        !marked ? "" : late ? strings.notConfirmedLate : modeDriven ? strings.modeNotConfirmed : strings.notConfirmed
      }
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
          aria-busy={isPending || (unconfirmed && !marked)}
          aria-describedby={marked ? `${widgetId}-confirm-mark` : undefined}
          className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
          data-confirmed={unconfirmed ? "false" : undefined}
          disabled={isPending}
          onClick={handleToggle}
          type="button"
        >
          <span className="bloom-toggle-segment" data-active={!isOn && !otherMode ? "true" : "false"}>
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
        aria-describedby={
          [stateText ? stateTextId : "", marked ? `${widgetId}-confirm-mark` : ""].join(" ").trim() || undefined
        }
        aria-pressed={labelsAreActions ? undefined : isOn}
        aria-label={accessibleName}
        aria-busy={isPending || (unconfirmed && !marked)}
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

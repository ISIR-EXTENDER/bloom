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
import { LatchCountdownNotice } from "./latch-countdown-notice";
import { rendererStrings } from "./renderer-strings";
import type { WidgetActionOutcome, WidgetRendererProps } from "./types";
import { useLatchCountdown } from "./use-latch-countdown";

/** A confirming press closer than this to the arming one is the same gesture, not a second decision. */
const CONFIRM_SETTLE_MS = 600;
const RELEASE_RETRIES = 3;
const RELEASE_RETRY_MS = 200;
/** The visual servoing switch: while on, the servo node moves the arm, so a suspend or STOP turns it off. */
export const VISUAL_SERVOING_SWITCH_TOPIC = "/ui/visual_servoing/on";
// Per topic, the last momentary publish attempted from any widget: a release retry must not undo a newer hold.
let momentaryPublishCount = 0;
const lastMomentaryPublishByTopic = new Map<string, number>();
const recordTopicPublish = (topic: string) => {
  momentaryPublishCount += 1;
  lastMomentaryPublishByTopic.set(topic, momentaryPublishCount);
};
// Per topic, shared by every toggle instance: a retry from an unmounted switch must not undo a remounted one.
let servoEpochCount = 0;
const servoEpochByTopic = new Map<string, number>();
const advanceServoEpoch = (topic: string) => {
  servoEpochCount += 1;
  servoEpochByTopic.set(topic, servoEpochCount);
  return servoEpochCount;
};

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
  const isMomentaryPressedRef = useRef(false);
  // Only the pointer that began a hold may end it; a latch (click, scan, dwell) has none.
  const holdPointerIdRef = useRef<number | null>(null);
  const [isMomentaryPressed, setIsMomentaryPressed] = useState(false);
  const [isMomentaryLatched, setIsMomentaryLatched] = useState(false);
  // A refused hold used to keep its pressed look; the reason now stays on the button.
  const [momentaryRefusal, setMomentaryRefusal] = useState("");
  // Press and release go out one after the other, and every press attempted is followed by a release.
  const momentaryQueueRef = useRef<Promise<void> | null>(null);
  const releaseOwedRef = useRef(false);
  // A queued press whose hold has ended before its turn is dropped: it would set the mode after the let-go.
  const holdGenerationRef = useRef(0);
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
  useEffect(() => {
    if (disabled) {
      setIsArmed(false);
      releaseHeldRef.current();
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
  }, [neutralRevision]);

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
    // A latched publish holds the topic too, so it cancels a pending release retry.
    if (intent.type === "topic-publish") {
      recordTopicPublish(intent.topic);
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
    holdPointerIdRef.current = null;
    isMomentaryPressedRef.current = true;
    setIsMomentaryPressed(true);
    setIsMomentaryLatched(true);
    publishMomentaryPayload("payload");
  };
  const releaseMomentary = () => {
    holdPointerIdRef.current = null;
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
  const sendMomentaryPayload = (payloadKey: "payload" | "releasedPayload"): MaybeOutcome => {
    recordTopicPublish(topic);
    try {
      const outcome = onActionIntent?.({
        type: "topic-publish",
        widgetId: descriptor.widget.id,
        widgetKind: descriptor.widget.kind,
        topic,
        messageType,
        payload: resolveMomentaryPayload(topic, payloadKey, descriptor.widget.settings[payloadKey]),
        ...(payloadKey === "releasedPayload" ? { release: true } : {}),
      } satisfies WidgetActionIntent);
      return outcome instanceof Promise ? outcome.catch(() => ({ accepted: false })) : outcome;
    } catch {
      return { accepted: false };
    }
  };
  const enqueueMomentary = (step: () => Promise<void> | undefined) => {
    const previous = momentaryQueueRef.current;
    const next = previous ? previous.then(step) : step();
    if (!next) {
      return;
    }
    momentaryQueueRef.current = next;
    void next.finally(() => {
      if (momentaryQueueRef.current === next) {
        momentaryQueueRef.current = null;
      }
    });
  };
  const sendRelease = (attempt: number): Promise<void> | undefined => {
    const outcome = sendMomentaryPayload("releasedPayload");
    const ownPublish = lastMomentaryPublishByTopic.get(topic);
    return afterOutcome(outcome, (result) => {
      if (result?.accepted !== false || attempt >= RELEASE_RETRIES) {
        return undefined;
      }
      return new Promise<void>((resolve) => setTimeout(resolve, RELEASE_RETRY_MS * 2 ** attempt)).then(() =>
        // Another widget's publish since this attempt holds the topic now; a retry would cancel its mode.
        lastMomentaryPublishByTopic.get(topic) === ownPublish ? sendRelease(attempt + 1) : undefined,
      );
    });
  };
  const queueMomentaryRelease = () => {
    if (!releaseOwedRef.current) {
      return;
    }
    releaseOwedRef.current = false;
    enqueueMomentary(() => sendRelease(0));
  };
  const publishMomentaryPayload = (payloadKey: "payload" | "releasedPayload") => {
    if (!topic || !messageType) {
      return;
    }
    if (payloadKey === "releasedPayload") {
      queueMomentaryRelease();
      return;
    }
    setMomentaryRefusal("");
    releaseOwedRef.current = true;
    holdGenerationRef.current += 1;
    const holdGeneration = holdGenerationRef.current;
    const refuse = (detail: string) => {
      holdPointerIdRef.current = null;
      isMomentaryPressedRef.current = false;
      setIsMomentaryPressed(false);
      setIsMomentaryLatched(false);
      setMomentaryRefusal(detail || rendererStrings(language).notSent);
      // A refused or lost press may still have reached the robot: let it go all the same.
      queueMomentaryRelease();
    };
    enqueueMomentary(() => {
      if (holdGeneration !== holdGenerationRef.current || !isMomentaryPressedRef.current) {
        return undefined;
      }
      return afterOutcome(sendMomentaryPayload("payload"), (result) => {
        if (
          result?.accepted === false &&
          isMomentaryPressedRef.current &&
          holdGeneration === holdGenerationRef.current
        ) {
          refuse(result.detail ?? "");
        }
        return undefined;
      });
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
  const hint = momentaryRefusal
    ? momentaryRefusal
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

  return (
    <div
      className="bloom-action-widget"
      data-armed={isArmed ? "true" : undefined}
      data-layout={layout}
      data-momentary={momentary ? "true" : "false"}
      data-pressed={momentary && isMomentaryPressed ? "true" : undefined}
      data-selection={selection}
      data-show-details={showDetails ? "true" : "false"}
      data-variant={variant || undefined}
    >
      <button
        aria-describedby={disabledReasonId}
        aria-label={`${
          selection
            ? `${visibleButtonLabel}: ${isSelected ? strings.requested : strings.notRequested}`
            : visibleButtonLabel
        }${disabledReason ? `. ${disabledReason}` : ""}`}
        aria-pressed={momentary ? isMomentaryPressed : selection ? isSelected : undefined}
        className="bloom-command-button"
        data-armed={isArmed ? "true" : undefined}
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

/** A /mode_request hold saved without a release payload let go with {}, which the server refuses: send Neutral. */
function resolveMomentaryPayload(topic: string, payloadKey: "payload" | "releasedPayload", payload: unknown): unknown {
  const missing =
    payload === undefined ||
    payload === null ||
    payload === "" ||
    (typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0);
  return payloadKey === "releasedPayload" && missing && topic === "/mode_request"
    ? { data: "geometric/both" }
    : payload;
}

type MaybeOutcome = WidgetActionOutcome | undefined | Promise<WidgetActionOutcome | undefined>;

function afterOutcome(
  outcome: MaybeOutcome,
  next: (result: WidgetActionOutcome | undefined) => Promise<void> | undefined,
): Promise<void> | undefined {
  return outcome instanceof Promise ? outcome.then(next) : next(outcome);
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
  const [localIsOn, setLocalIsOn] = useState(getBooleanSetting(descriptor.widget.settings, "initialValue", false));
  const readBackValue = controlState?.value;
  useEffect(() => {
    if (typeof readBackValue === "boolean") {
      setLocalIsOn(readBackValue);
    }
  }, [readBackValue]);
  const allowToggle = useRepeatGuard(conditioning?.repeatGuardMs);
  const controlledToggleState = controlState?.toggleState;
  const isOn = controlledToggleState ? controlledToggleState === "on" : localIsOn;
  const stateLabel = isOn ? onLabel : offLabel;
  const [isPending, setIsPending] = useState(false);
  const stateTextId = useId();
  const isServoSwitch = topic === VISUAL_SERVOING_SWITCH_TOPIC;
  // An On still travelling, or refused or lost, counts as on for a suspend until an off is accepted.
  const pendingOnRef = useRef(false);
  const possiblyOnRef = useRef(false);
  const publishServoOff = (epoch: number, attempt: number): Promise<void> | undefined => {
    const intent = createWidgetActionIntent(descriptor.widget, { nextState: "off", type: "toggle" });
    let outcome: MaybeOutcome;
    // Marked a release so the STOP and hold gates let the switch-off through.
    try {
      const sent = onActionIntent?.(intent.type === "topic-publish" ? { ...intent, release: true } : intent);
      outcome = sent instanceof Promise ? sent.catch(() => ({ accepted: false })) : sent;
    } catch {
      outcome = { accepted: false };
    }
    return afterOutcome(outcome, (result) => {
      if (epoch !== servoEpochByTopic.get(topic)) {
        return undefined;
      }
      if (result?.accepted !== false) {
        possiblyOnRef.current = false;
        setLocalIsOn(false);
        return undefined;
      }
      // A refused off keeps reading On; the runtime shell shows the refusal.
      if (attempt >= RELEASE_RETRIES) {
        return undefined;
      }
      return new Promise<void>((resolve) => setTimeout(resolve, RELEASE_RETRY_MS * 2 ** attempt)).then(() =>
        epoch === servoEpochByTopic.get(topic) ? publishServoOff(epoch, attempt + 1) : undefined,
      );
    });
  };
  const switchOffServo = () => {
    void publishServoOff(advanceServoEpoch(topic), 0);
  };
  const switchOffServoRef = useRef(() => {});
  switchOffServoRef.current = () => {
    if (isServoSwitch && (isOn || pendingOnRef.current || possiblyOnRef.current)) {
      switchOffServo();
    }
  };
  const lastNeutralRevisionRef = useRef(neutralRevision);
  useEffect(() => {
    if (neutralRevision === lastNeutralRevisionRef.current) {
      return;
    }
    lastNeutralRevisionRef.current = neutralRevision;
    switchOffServoRef.current();
  }, [neutralRevision]);
  const disabled = controlState?.disabled === true;
  useEffect(() => {
    if (disabled) {
      switchOffServoRef.current();
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

    setIsPending(true);
    const epoch = advanceServoEpoch(topic);
    pendingOnRef.current = nextState === "on";
    if (isServoSwitch && nextState === "on") {
      possiblyOnRef.current = true;
    }
    let accepted = false;
    try {
      const outcome = await onActionIntent(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" }));
      accepted = outcome === undefined || outcome.accepted;
    } catch {
      // The runtime shell owns visible error reporting; a rejected publish counts as refused.
    } finally {
      pendingOnRef.current = false;
      setIsPending(false);
    }
    if (isServoSwitch && nextState === "on" && (!accepted || epoch !== servoEpochByTopic.get(topic))) {
      // A refused or lost On may still have reached the servo, and a suspend that landed meanwhile keeps it off.
      switchOffServo();
      return;
    }
    if (isServoSwitch && epoch !== servoEpochByTopic.get(topic)) {
      return;
    }
    if (isServoSwitch && nextState === "off" && accepted) {
      possiblyOnRef.current = false;
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

  if (variant === "mode-segmented") {
    return (
      <div className="bloom-toggle-widget" data-state={isOn ? "active" : "inactive"} data-variant={variant}>
        <strong className="bloom-toggle-title">{descriptor.widget.title}</strong>
        <button
          aria-pressed={isOn}
          aria-label={`${descriptor.widget.title}: ${stateLabel}`}
          aria-busy={isPending}
          className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
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
      </div>
    );
  }

  return (
    <div
      className="bloom-toggle-widget bloom-info-card"
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
        aria-label={`${descriptor.widget.title}: ${stateLabel}`}
        aria-busy={isPending}
        className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
        disabled={isPending}
        onClick={handleToggle}
        type="button"
      >
        {stateLabel}
      </button>
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

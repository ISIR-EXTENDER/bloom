import {
  asRecord,
  createWidgetActionIntent,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  hidesTitle,
  localizeOperatorText,
  readModeRequestData,
  resolveCommandPayload,
  type WidgetActionIntent,
} from "@bloom/widgets";

import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type CommandStateBinding,
  isModeRequestTopic,
  knownValue,
  MODE_REQUEST_TOPIC,
  modeCommandBinding,
  outcomeOf,
  parameterKey,
  parameterToggleBinding,
  readSelection,
  readToggleState,
  SERVOING_ACTIVE_KEY,
  type ToggleBinding,
  topicToggleBinding,
  useCommandPress,
  useCommandState,
  useCommandStateStore,
  VISUAL_SERVOING_SWITCH_TOPIC,
} from "./command-state";
import { LatchCountdownNotice } from "./latch-countdown-notice";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import type { WidgetActionOutcome, WidgetRendererProps } from "./types";
import { useLatchCountdown } from "./use-latch-countdown";

/** A confirming press closer than this to the arming one is the same gesture, not a second decision. */
export const CONFIRM_SETTLE_MS = 600;

/** The visual servoing switch: while on, the servo node moves the arm, so a suspend or STOP turns it off. */
export { VISUAL_SERVOING_SWITCH_TOPIC };

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
  const widgetId = descriptor.widget.id;
  // A mode button reads the manager's state from the store (ADR 0142); a frame button keeps its local selection.
  const binding = useMemo(
    () =>
      momentary ? null : (controlState?.commandBinding ?? ownModeBinding(descriptor.widget.settings, messageType)),
    [controlState?.commandBinding, descriptor.widget.settings, messageType, momentary],
  );
  const store = useCommandStateStore();
  const entryOf = (key: string) => store.snapshot[key] ?? null;
  const storeSelection = readSelection(binding, entryOf);
  const commandPress = useCommandPress();
  const sending = commandPress.phase === "sending";
  const selection: string | undefined = sending
    ? "sending"
    : storeSelection
      ? storeSelection.state
      : controlState?.selection;
  const isSelected = selection === "selected";
  const disabled = controlState?.disabled === true;
  const disabledReason = controlState?.disabledReason;
  // An unavailable widget's frame already states the reason; saying it twice only grows the card.
  const showsDisabledReason = Boolean(disabledReason) && controlState?.unavailable !== true;
  const disabledReasonId = showsDisabledReason ? `${descriptor.widget.id}-disabled-reason` : undefined;
  const isMomentaryPressedRef = useRef(false);
  // Only the pointer that began a hold may end it; a latch (click, scan, dwell) has none.
  const holdPointerIdRef = useRef<number | null>(null);
  const [isMomentaryHeld, setIsMomentaryHeld] = useState(false);
  const [isMomentaryLatched, setIsMomentaryLatched] = useState(false);
  const [holdRefusal, setHoldRefusal] = useState("");
  const [isArmed, setIsArmed] = useState(false);
  const armedAtRef = useRef(0);
  const visibleButtonLabel = momentary
    ? isMomentaryHeld
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
    if (binding && onActionIntent) {
      commandPress.press(binding.writes, () => onActionIntent(intent));
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
  const endHold = () => {
    holdPointerIdRef.current = null;
    isMomentaryPressedRef.current = false;
    setIsMomentaryHeld(false);
    setIsMomentaryLatched(false);
  };
  const releaseMomentary = () => {
    endHold();
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
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Press and release are absolute payloads, each sent once; the server orders them.
  const publishMomentary = (value: "pressed" | "released") => {
    if (!topic || !messageType || !onActionIntent) {
      return;
    }
    const outcome = onActionIntent({
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
    } satisfies WidgetActionIntent);
    if (value !== "pressed") {
      return;
    }
    setHoldRefusal("");
    // A refused press was not applied: the hold ends there, with nothing to release.
    const settle = (result: WidgetActionOutcome | undefined) => {
      const { detail, outcome: kind } = outcomeOf(result);
      if (kind === "refused" && mountedRef.current && isMomentaryPressedRef.current) {
        endHold();
        setHoldRefusal(detail ?? "");
      }
    };
    if (outcome instanceof Promise) {
      outcome.then(settle, () => undefined);
    } else {
      settle(outcome);
    }
  };

  const layout = getBooleanSetting(descriptor.widget.settings, "hide_title", false) ? "bare" : "card";
  const showsTitle =
    layout === "card" && descriptor.widget.title.trim().toLowerCase() !== buttonLabel.trim().toLowerCase();
  const detail = actionLabel || command;
  const authoredHint = getStringSetting(descriptor.widget.settings, "hint", "");
  const strings = rendererStrings(language);
  const refusal = commandPress.phase === "refused" ? (commandPress.detail ?? "") : holdRefusal;
  const notConfirmed = commandPress.phase === "not-confirmed";
  // A timeout of zero means the button stays armed until it is pressed again, which is the opposite of
  // what the countdown wording promised on exactly the guard that protects a destructive command.
  const hint = refusal
    ? refusal
    : sending
      ? strings.sending
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
  const mark = notConfirmed ? strings.notConfirmedByRobot : "";
  const stateName = sending
    ? strings.sending
    : selection === "unknown"
      ? strings.unknownState
      : selection
        ? `${isSelected ? strings.requested : strings.notRequested}${sourceSuffix(storeSelection?.source, strings)}`
        : "";

  return (
    <div
      className="bloom-action-widget"
      data-armed={isArmed ? "true" : undefined}
      data-command-state={storeSelection || sending ? selection : undefined}
      data-confirmed={notConfirmed ? "false" : undefined}
      data-layout={layout}
      data-momentary={momentary ? "true" : "false"}
      data-pressed={momentary && isMomentaryHeld ? "true" : undefined}
      data-selection={selection}
      data-show-details={showDetails ? "true" : "false"}
      data-source={storeSelection?.source ?? undefined}
      data-variant={variant || undefined}
    >
      <button
        aria-busy={sending ? true : undefined}
        aria-describedby={
          [disabledReasonId, mark || refusal ? `${descriptor.widget.id}-confirm-mark` : ""].join(" ").trim() ||
          undefined
        }
        aria-label={`${stateName ? `${visibleButtonLabel}: ${stateName}` : visibleButtonLabel}${
          disabledReason ? `. ${disabledReason}` : ""
        }`}
        aria-pressed={momentary ? isMomentaryHeld : selection ? isSelected : undefined}
        className="bloom-command-button"
        data-armed={isArmed ? "true" : undefined}
        data-confirmed={notConfirmed ? "false" : undefined}
        data-selected={isSelected ? "true" : undefined}
        data-confirm-press={confirmPress ? "true" : undefined}
        data-momentary={momentary ? "true" : "false"}
        data-pressed={momentary && isMomentaryHeld ? "true" : undefined}
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
        {hint && !refusal ? <span className="bloom-action-hint">{hint}</span> : null}
        <ConfirmationMark
          id={`${descriptor.widget.id}-confirm-mark`}
          refused={Boolean(refusal)}
          text={refusal || mark}
        />
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

function sourceSuffix(source: string | null | undefined, strings: RendererStrings): string {
  if (source === "measured") {
    return `, ${strings.reportedByRobot}`;
  }
  return source === "commanded" || source === "reset" ? `, ${strings.lastAsked}` : "";
}

// The button's aria-label hides its content, so the button points here by aria-describedby.
function ConfirmationMark({ id, refused, text }: { id: string; refused?: boolean; text: string }) {
  return text ? (
    <span className="bloom-confirm-mark" data-late={refused ? "true" : undefined} id={id}>
      {text}
    </span>
  ) : null;
}

/** A button publishing a mode request itself; a preset-routed one gets its binding from the runtime. */
function ownModeBinding(settings: Record<string, unknown>, messageType: string): CommandStateBinding | null {
  const topic = getStringSetting(settings, "topic", "");
  if (!topic || !isModeRequestTopic(topic)) {
    return null;
  }
  const data = readModeRequestData(resolveCommandPayload(settings, messageType || "std_msgs/msg/String"));
  return data ? modeCommandBinding(topic, data) : null;
}

/** What a toggle reads in the store: its topic's payloads, or the node parameter it sets. */
function toggleBindingOf(widget: WidgetRendererProps["descriptor"]["widget"]): ToggleBinding | null | "local" {
  const on = createWidgetActionIntent(widget, { nextState: "on", type: "toggle" });
  const off = createWidgetActionIntent(widget, { nextState: "off", type: "toggle" });
  if (on.type === "topic-publish" && off.type === "topic-publish") {
    return topicToggleBinding(on.topic, on.messageType, on.payload, off.payload);
  }
  if (on.type === "toggle-state") {
    const binding = asRecord(on.runtimeBinding);
    const mapping = asRecord(binding.value_mapping);
    if (binding.adapter === "parameter" && typeof mapping.node === "string" && typeof mapping.parameter === "string") {
      return parameterToggleBinding(mapping.node, mapping.parameter);
    }
    return on.runtimeBinding === undefined ? "local" : null;
  }
  return null;
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
  const binding = useMemo(() => toggleBindingOf(descriptor.widget), [descriptor.widget]);
  const isLocal = binding === "local";
  const store = useCommandStateStore();
  const entryOf = (key: string) => store.snapshot[key] ?? null;
  const view = readToggleState(isLocal ? null : binding, entryOf);
  const commandPress = useCommandPress();
  const sending = commandPress.phase === "sending";
  const askedRef = useRef<"off" | "on">("off");
  const [localIsOn, setLocalIsOn] = useState(() =>
    getBooleanSetting(descriptor.widget.settings, "initialValue", false),
  );
  const allowToggle = useRepeatGuard(conditioning?.repeatGuardMs);
  const state: "off" | "on" | "other" | "sending" | "unknown" = isLocal
    ? localIsOn
      ? "on"
      : "off"
    : sending
      ? "sending"
      : view.state;
  const isOn = state === "on";
  const strings = rendererStrings(language);
  const modeTopic = isModeRequestTopic(topic);
  const stateLabel =
    state === "on"
      ? onLabel
      : state === "off"
        ? offLabel
        : state === "sending"
          ? strings.sending
          : state === "other"
            ? modeTopic
              ? strings.otherMode
              : strings.otherValue
            : strings.unknownState;
  const stateTextId = useId();
  const isServoSwitch = topic === VISUAL_SERVOING_SWITCH_TOPIC;
  const servoing = useCommandState(isServoSwitch ? SERVOING_ACTIVE_KEY : null);
  const servoLive = isServoSwitch && knownValue(servoing)?.value === true;
  const inputHint = useUndeclaredInputHint(descriptor.widget.settings, strings);

  const send = (nextState: "off" | "on", release: boolean) => {
    if (!onActionIntent || isLocal || binding === null) {
      return;
    }
    const intent = createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" });
    // Marked a release so the STOP and hold gates let a switch-off through.
    const sent = release && intent.type === "topic-publish" ? { ...intent, release: true } : intent;
    askedRef.current = nextState;
    commandPress.press(
      binding.keys.map(({ key, off, on }) => ({ key, value: nextState === "on" ? on : off })),
      () => onActionIntent(sent),
    );
  };
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // A suspend, a STOP, a disable or leaving the screen switches servoing off, once.
  const switchOffServoRef = useRef(() => {});
  switchOffServoRef.current = () => {
    if (!isServoSwitch || !onActionIntent || !(isOn || (sending && askedRef.current === "on"))) {
      return;
    }
    if (mountedRef.current) {
      send("off", true);
      return;
    }
    const intent = createWidgetActionIntent(descriptor.widget, { nextState: "off", type: "toggle" });
    if (intent.type === "topic-publish") {
      void Promise.resolve(onActionIntent({ ...intent, release: true })).catch(() => undefined);
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
  useEffect(
    () => () => {
      mountedRef.current = false;
      switchOffServoRef.current();
    },
    [],
  );

  const handleToggle = () => {
    if (!allowToggle()) {
      return;
    }
    if (isLocal) {
      const nextState = localIsOn ? "off" : "on";
      setLocalIsOn(nextState === "on");
      if (onActionIntent) {
        void Promise.resolve(
          onActionIntent(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" })),
        ).catch(() => undefined);
      }
      return;
    }
    // What the press is measured against: the store, or what this control is still sending.
    const basis = sending ? askedRef.current : state;
    const nextState = basis === "on" ? "off" : "on";
    send(nextState, isServoSwitch && nextState === "off");
  };

  const onStateLabel = getStringSetting(descriptor.widget.settings, "onStateLabel", "");
  const offStateLabel = getStringSetting(descriptor.widget.settings, "offStateLabel", "");
  const commandedState = state === "on" ? onStateLabel : state === "off" ? offStateLabel : "";
  const stateText = commandedState
    ? `${localizeOperatorText("commanded", language)}${language === "fr" ? " : " : ": "}${commandedState}`
    : "";
  const inline = getStringSetting(descriptor.widget.settings, "layout", "") === "inline";
  // With state labels the button words are verbs ("Open gripper"): "pressed" would contradict the commanded state.
  const labelsAreActions = Boolean(onStateLabel || offStateLabel);
  const refusal = commandPress.phase === "refused" ? (commandPress.detail ?? "") : "";
  const notConfirmed = commandPress.phase === "not-confirmed";
  const source = isLocal || sending ? null : view.source;
  const accessibleName = `${descriptor.widget.title}: ${stateLabel}${
    state === "on" || state === "off" || state === "other" ? sourceSuffix(source, strings) : ""
  }${notConfirmed ? `, ${strings.notConfirmedName}` : ""}`;
  const markText = refusal || (notConfirmed ? strings.notConfirmedByRobot : "");
  const markId = `${widgetId}-confirm-mark`;
  const mark = <ConfirmationMark id={markId} refused={Boolean(refusal)} text={markText} />;
  const stateAttributes = {
    "data-command-state": isLocal ? undefined : state,
    "data-confirmed": notConfirmed ? "false" : undefined,
    "data-source": source ?? undefined,
    "data-state": isOn ? "active" : "inactive",
  };
  const pressed = state === "on" ? true : state === "off" ? false : undefined;
  // Not knowing what the robot holds, the toggle offers both sides; action words ask for the opposite state.
  const choices: { label: string; next: "off" | "on" }[] | null =
    !isLocal && (state === "unknown" || state === "other")
      ? [
          { label: offLabel, next: labelsAreActions ? "on" : "off" },
          { label: onLabel, next: labelsAreActions ? "off" : "on" },
        ]
      : null;
  const choose = (next: "off" | "on") => {
    if (allowToggle()) {
      send(next, isServoSwitch && next === "off");
    }
  };
  const choiceName = (label: string) =>
    `${descriptor.widget.title}: ${label}${notConfirmed ? `, ${strings.notConfirmedName}` : ""}`;
  // The two sides fill the box the single button fills: a row of equal buttons, or the segmented track.
  const renderChoices = (segmented: boolean, describedBy: string) =>
    choices ? (
      <div className={segmented ? "bloom-toggle-button bloom-toggle-track" : "bloom-toggle-choices"}>
        {choices.map(({ label, next }) => (
          <button
            aria-describedby={describedBy || undefined}
            aria-label={choiceName(label)}
            aria-pressed={labelsAreActions ? undefined : false}
            className={segmented ? "bloom-toggle-segment" : "bloom-toggle-button is-off"}
            data-active={segmented ? "false" : undefined}
            data-confirmed={notConfirmed ? "false" : undefined}
            key={next}
            onClick={() => choose(next)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    ) : null;

  if (variant === "mode-segmented") {
    return (
      <div className="bloom-toggle-widget" data-variant={variant} {...stateAttributes}>
        <strong className="bloom-toggle-title">{descriptor.widget.title}</strong>
        {choices ? (
          renderChoices(true, markText ? markId : "")
        ) : (
          <button
            aria-pressed={pressed ?? false}
            aria-label={accessibleName}
            aria-busy={sending || undefined}
            aria-describedby={markText ? markId : undefined}
            className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
            data-confirmed={notConfirmed ? "false" : undefined}
            onClick={handleToggle}
            type="button"
          >
            <span className="bloom-toggle-segment" data-active={state === "off" ? "true" : "false"}>
              {offLabel}
            </span>
            <span className="bloom-toggle-segment" data-active={isOn ? "true" : "false"}>
              {onLabel}
            </span>
          </button>
        )}
        {mark}
      </div>
    );
  }

  return (
    <div
      className="bloom-toggle-widget bloom-info-card"
      data-layout={inline ? "inline" : "stacked"}
      data-narrow={descriptor.widget.layout.width < 260 ? "true" : undefined}
      {...stateAttributes}
    >
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-widget-head bloom-toggle-head">
          <strong>{descriptor.widget.title}</strong>
          {stateText || (choices && labelsAreActions) ? (
            <span className="bloom-toggle-state" id={stateTextId}>
              {stateText || stateLabel}
            </span>
          ) : null}
          {servoLive ? <span className="bloom-toggle-live">{strings.servoRunning}</span> : null}
        </header>
      )}
      {choices ? (
        renderChoices(
          false,
          [labelsAreActions && !hidesTitle(descriptor.widget.settings) ? stateTextId : "", markText ? markId : ""]
            .join(" ")
            .trim(),
        )
      ) : (
        <button
          aria-describedby={[stateText ? stateTextId : "", markText ? markId : ""].join(" ").trim() || undefined}
          aria-pressed={labelsAreActions ? undefined : (pressed ?? false)}
          aria-label={accessibleName}
          aria-busy={sending || undefined}
          className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
          data-confirmed={notConfirmed ? "false" : undefined}
          onClick={handleToggle}
          type="button"
        >
          {stateLabel}
        </button>
      )}
      {mark}
      {inputHint ? <span className="bloom-action-hint">{inputHint}</span> : null}
      {showDetails && topic ? <span className="bloom-widget-topic">{topic}</span> : null}
    </div>
  );
}

const INPUT_ENABLED = /^inputs\.(.+)\.enabled$/;

/** A manager input switch whose source the manager does not declare changes nothing: say so. */
function useUndeclaredInputHint(settings: Record<string, unknown>, strings: RendererStrings): string {
  const mapping = asRecord(asRecord(settings.runtime_binding).value_mapping);
  const node = typeof mapping.node === "string" ? mapping.node : "";
  const source = typeof mapping.parameter === "string" ? INPUT_ENABLED.exec(mapping.parameter)?.[1] : undefined;
  const sources = knownValue(useCommandState(node && source ? parameterKey(node, "inputs.sources") : null));
  return source && Array.isArray(sources?.value) && !sources.value.includes(source) ? strings.inputNotDeclared : "";
}

function getLabelAlignment(value: string): "center" | "left" | "right" {
  if (value === "center" || value === "right") {
    return value;
  }

  return "left";
}

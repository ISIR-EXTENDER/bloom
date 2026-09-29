import type { RuntimeLanguage } from "@bloom/api-client";
import { getBooleanSetting, getStringSetting, hidesTitle, localizeOperatorText } from "@bloom/widgets";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { CONFIRM_SETTLE_MS, useRepeatGuard } from "./action-renderers";
import { knownValue, useCommandState } from "./command-state";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import type { GoToRecord, SavedPositionEntry, WidgetDataSnapshot, WidgetRendererProps } from "./types";
import { isSampleStale, useNow } from "./use-now";

const DELETE_CONFIRM_MS = 4000;
/** Go home arms for the same five seconds; scanning holds an armed control's highlight meanwhile. */
const GO_TO_CONFIRM_MS = 5000;
/** The server's record of the last Go to: it judges arrival, on the measured tip when TF has it. */
const GO_KEY = "positions:go";
/** The seed's own words for the Release button, so the library's Cancel reads the same in every language. */
const CANCEL_WORDS = "Cancel the pose";
const POSE_NAME = /^[a-z0-9_]{1,64}$/;

type LibrarySnapshot = Extract<WidgetDataSnapshot, { type: "position-library" }>;

/**
 * Save the hand's pose, keep a named list, and go back to one. Go to is an armed one-shot: the first press arms
 * it, the second sends the saved pose to the manager's pose target, and the manager's status reports the move.
 * The bench's tools (rename, delete, export of joint targets) stay behind `editable`.
 */
export function PositionLibraryWidget({
  conditioning,
  controlState,
  descriptor,
  data,
  language,
  neutralRevision,
  onActionIntent,
}: WidgetRendererProps) {
  const strings = rendererStrings(language);
  const settings = descriptor.widget.settings;
  const widgetId = descriptor.widget.id;
  const widgetKind = descriptor.widget.kind;
  const showDetails = getBooleanSetting(settings, "show_details", false);
  // A pick-only library (the operator Positions screen) sets editable: false.
  const editable = getBooleanSetting(settings, "editable", true);
  const goTo = getBooleanSetting(settings, "go_to", false);
  const eePoseTopic = getStringSetting(settings, "eePoseTopic", "");
  const snapshot = data?.type === "position-library" ? data : undefined;
  const joints = snapshot?.joints;
  const hand = snapshot?.eePose;
  const saved = snapshot?.saved ?? [];
  const busy = snapshot?.busy === true;
  const disabled = controlState?.disabled === true || controlState?.unavailable === true;
  // Saving promises the robot's current pose. On a sample that stopped arriving it would save where the
  // arm was, under a name someone later drives to.
  const now = useNow(1000);
  const jointsLive = joints !== undefined && !isSampleStale(joints.receivedAt, now);
  const handLive = !eePoseTopic || (hand !== undefined && !isSampleStale(hand.receivedAt, now));
  const saveWaiting = !jointsLive
    ? strings.poseSaveWaitingJoints
    : handLive
      ? ""
      : strings.poseSaveWaitingHand(eePoseTopic);
  const allowActivation = useRepeatGuard(conditioning?.repeatGuardMs);
  const [armedDelete, setArmedDelete] = useState("");
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToArm = useGoToArm(neutralRevision, disabled);
  const [renaming, setRenaming] = useState("");
  const going = useRunningGoTo(snapshot);

  useEffect(
    () => () => {
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
      }
    },
    [],
  );

  // The 3D view previews what an armed Go to would send; disarming, for any reason, clears it.
  const emitRef = useRef(onActionIntent);
  emitRef.current = onActionIntent;
  const armedName = goToArm.armed;
  useEffect(() => {
    if (!goTo) {
      return;
    }
    emitRef.current?.({ type: "position-op", op: "preview", widgetId, widgetKind, name: armedName || undefined });
  }, [armedName, goTo, widgetId, widgetKind]);
  useEffect(
    () => () => {
      if (goTo) {
        emitRef.current?.({ type: "position-op", op: "preview", widgetId, widgetKind });
      }
    },
    [goTo, widgetId, widgetKind],
  );

  const emit = (intent: Parameters<NonNullable<typeof onActionIntent>>[0]) => onActionIntent?.(intent);

  const handleSave = () => {
    if (!joints || saveWaiting || disabled || !allowActivation()) {
      return;
    }
    emit({
      type: "position-op",
      op: "capture",
      widgetId,
      widgetKind,
      jointNames: [...joints.names],
      positions: [...joints.positions],
      ...(eePoseTopic && hand
        ? { eePose: { frameId: hand.frameId, position: hand.position, orientation: hand.orientation } }
        : {}),
    });
  };

  const handleGoTo = (pose: SavedPositionEntry) => {
    if (disabled || !allowActivation()) {
      return;
    }
    if (goToArm.press(pose.name)) {
      const fingerprint = pose.eePose?.fingerprint;
      emit({ type: "position-op", op: "go", widgetId, widgetKind, name: pose.name, fingerprint });
    }
  };

  const handleDelete = (name: string) => {
    if (armedDelete !== name) {
      setArmedDelete(name);
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
      }
      disarmTimer.current = setTimeout(() => setArmedDelete(""), DELETE_CONFIRM_MS);
      return;
    }
    setArmedDelete("");
    emit({ type: "position-op", op: "delete", widgetId, widgetKind, name });
  };

  const handleRename = (name: string, newName: string) => {
    setRenaming("");
    if (newName !== name) {
      emit({ type: "position-op", op: "rename", widgetId, widgetKind, name, newName });
    }
  };

  const progress = goTo ? (
    <GoToProgress
      going={going}
      language={language}
      onCancel={() => emit({ type: "position-op", op: "cancel", widgetId, widgetKind })}
      strings={strings}
    />
  ) : null;

  return (
    <div
      className="bloom-position-library bloom-info-card"
      data-go-to={goTo ? "true" : undefined}
      data-show-details={showDetails ? "true" : "false"}
    >
      {showDetails && !hidesTitle(descriptor.widget.settings) ? (
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <span className="bloom-widget-readout">
            {strings.poseCount(saved.length)} ·{" "}
            {joints
              ? jointsLive
                ? strings.liveJoints(joints.names.length)
                : `${strings.liveJoints(joints.names.length)} · ${strings.stale}`
              : strings.waitingJointStates}
          </span>
        </header>
      ) : (
        // The group label above names the list on screen.
        <h3 className="sr-only">{descriptor.widget.title}</h3>
      )}

      {saved.length === 0 ? (
        <p className="bloom-position-empty">{strings.poseNone}</p>
      ) : (
        <ul
          aria-label={editable || goTo ? strings.poseListLabel : strings.poseListReadOnly}
          className="bloom-position-list"
          data-readonly={editable || goTo ? undefined : "true"}
        >
          {saved.map((pose) => (
            <li data-armed={goToArm.armed === pose.name ? "true" : undefined} key={pose.name}>
              {renaming === pose.name ? (
                <RenameField
                  name={pose.name}
                  onCancel={() => setRenaming("")}
                  onSave={(newName) => handleRename(pose.name, newName)}
                  strings={strings}
                />
              ) : (
                <>
                  <span className="bloom-position-name">{editable ? pose.name : poseLabel(pose.name)}</span>
                  <span className="bloom-position-meta">{describePose(pose, goTo && !editable)}</span>
                  {pose.eePose && !pose.eePose.verified ? (
                    <span className="bloom-position-unverified" title={strings.poseNotVerifiedHint}>
                      {strings.poseNotVerified}
                    </span>
                  ) : null}
                  {goTo ? (
                    <GoToButton
                      armed={goToArm.armed === pose.name}
                      disabled={busy || disabled}
                      label={poseLabel(pose.name)}
                      onPress={() => handleGoTo(pose)}
                      pose={pose}
                      strings={strings}
                    />
                  ) : null}
                  {editable ? (
                    <>
                      <button
                        aria-label={strings.poseRenameLabel(pose.name)}
                        className="bloom-position-rename"
                        disabled={busy || disabled || going?.record.name === pose.name}
                        onClick={() => setRenaming(pose.name)}
                        type="button"
                      >
                        {strings.poseRename}
                      </button>
                      <button
                        aria-label={
                          armedDelete === pose.name
                            ? strings.poseDeleteConfirmLabel(pose.name)
                            : strings.poseDeleteLabel(pose.name)
                        }
                        className="bloom-position-delete"
                        data-armed={armedDelete === pose.name ? "true" : "false"}
                        // The pose a Go to is heading for stays until that move ends.
                        disabled={busy || disabled || going?.record.name === pose.name}
                        onClick={() => handleDelete(pose.name)}
                        onKeyDown={ignoreKeyRepeat}
                        type="button"
                      >
                        {armedDelete === pose.name ? strings.poseDeleteConfirm : strings.poseDelete}
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {progress}

      {editable || goTo ? (
        <div className="bloom-position-footer">
          <button
            aria-describedby={saveWaiting ? `${widgetId}-save-waiting` : undefined}
            aria-label={strings.poseSaveLabel}
            className="bloom-position-capture"
            disabled={busy || disabled || Boolean(saveWaiting)}
            onClick={handleSave}
            onKeyDown={ignoreKeyRepeat}
            type="button"
          >
            {strings.poseSave}
          </button>
          {editable ? (
            <button
              aria-label={strings.poseExportLabel}
              className="bloom-position-export"
              disabled={busy || disabled || saved.length === 0}
              onClick={() => emit({ type: "position-op", op: "export", widgetId, widgetKind })}
              type="button"
            >
              {strings.poseExport}
            </button>
          ) : null}
          {saveWaiting ? (
            <p className="bloom-position-note" id={`${widgetId}-save-waiting`}>
              {saveWaiting}
            </p>
          ) : editable ? (
            <p className="bloom-position-note">{strings.poseExportNote}</p>
          ) : null}
        </div>
      ) : null}
      {!editable && !goTo && saved.length > 0 ? (
        // Nothing here sends a pose; rows that look pickable would promise a move that never comes.
        <p className="bloom-position-note">{strings.poseReferenceOnly}</p>
      ) : null}

      {snapshot?.exportYaml ? (
        <section aria-label={strings.poseYamlLabel} className="bloom-position-yaml">
          <pre>{snapshot.exportYaml}</pre>
        </section>
      ) : null}

      <p aria-live="polite" className="bloom-position-notice" role="status">
        {snapshot?.notice || describeEvent(snapshot?.event, strings)}
      </p>
    </div>
  );
}

/**
 * One armed Go to at a time. The first press arms, a confirming press closer than the settle is the same gesture,
 * and STOP, a control that goes inert, the timeout or leaving the screen disarm it.
 */
function useGoToArm(neutralRevision: number | undefined, disabled: boolean) {
  const [armed, setArmed] = useState("");
  const armedAtRef = useRef(0);

  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = setTimeout(() => setArmed(""), GO_TO_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const lastNeutralRef = useRef(neutralRevision);
  useEffect(() => {
    if (neutralRevision !== lastNeutralRef.current) {
      lastNeutralRef.current = neutralRevision;
      setArmed("");
    }
  }, [neutralRevision]);
  useEffect(() => {
    if (disabled) {
      setArmed("");
    }
  }, [disabled]);

  return {
    armed,
    /** True when this press confirms and the pose should go. */
    press(name: string): boolean {
      if (armed !== name) {
        armedAtRef.current = Date.now();
        setArmed(name);
        return false;
      }
      if (Date.now() - armedAtRef.current < CONFIRM_SETTLE_MS) {
        return false;
      }
      setArmed("");
      return true;
    },
  };
}

function GoToButton({
  armed,
  disabled,
  label,
  onPress,
  pose,
  strings,
}: {
  armed: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
  pose: SavedPositionEntry;
  strings: RendererStrings;
}) {
  const unreachable = !pose.eePose;
  return (
    <button
      aria-label={
        unreachable
          ? `${strings.poseGoTo(label)}: ${strings.poseNoHand}`
          : armed
            ? strings.poseGoToArmedLabel(label)
            : strings.poseGoTo(label)
      }
      className="bloom-position-go"
      data-armed={armed ? "true" : undefined}
      disabled={disabled || unreachable}
      onClick={onPress}
      onKeyDown={ignoreKeyRepeat}
      title={unreachable ? strings.poseNoHand : undefined}
      type="button"
    >
      {armed ? strings.poseGoToArmed : strings.poseGoTo(label)}
    </button>
  );
}

/** A held Enter or Space repeats the click; one press is one decision, as on Go home. */
function ignoreKeyRepeat(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.repeat && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
  }
}

type RunningGoTo = { record: GoToRecord; unconfirmed: boolean } | null;

/**
 * The last Go to of this library's app: the server's record once it is newer than this tablet's press, the press
 * itself until then. Null when there is nothing to report.
 */
function useRunningGoTo(snapshot: LibrarySnapshot | undefined): RunningGoTo {
  const entry = useCommandState(GO_KEY);
  const known = knownValue(entry)?.value as GoToRecord | undefined;
  const scope = snapshot?.scope;
  const sent = snapshot?.sent;
  const ours = known && scope && known.config_id === scope.configId && known.app_id === scope.appId ? known : null;
  const answered = ours !== null && entry !== null && (!sent || entry.revision > sent.revision);
  if (answered && ours) {
    return { record: ours, unconfirmed: false };
  }
  if (sent) {
    const record: GoToRecord = { name: sent.name, config_id: "", app_id: "", state: "going" };
    return { record, unconfirmed: sent.unconfirmed === true };
  }
  return null;
}

/** What the last Go to is doing, as the server followed it: the manager's status and the tip's distance. */
function GoToProgress({
  going,
  language,
  onCancel,
  strings,
}: {
  going: RunningGoTo;
  language: RuntimeLanguage | undefined;
  onCancel: () => void;
  strings: RendererStrings;
}) {
  if (!going) {
    return null;
  }
  const { record, unconfirmed } = going;
  const label = poseLabel(record.name);
  const hasOffset = typeof record.offset_mm === "number" && typeof record.offset_deg === "number";
  const offsetText = hasOffset
    ? ` · ${
        record.measured
          ? strings.poseOffsetMeasured(record.offset_mm as number, record.offset_deg as number)
          : strings.poseOffsetCommanded(record.offset_mm as number, record.offset_deg as number)
      }`
    : "";
  const text = unconfirmed
    ? strings.poseUnconfirmed(label)
    : record.state === "moving"
      ? `${strings.poseMoving(label)} · ${strings.reportedByRobot}${offsetText}`
      : record.state === "arrived"
        ? `${strings.poseArrived(label)}${offsetText}`
        : record.state === "stopped"
          ? `${strings.poseStoppedShort(label)}${offsetText}`
          : record.state === "unreachable"
            ? `${strings.poseUnreachable(label)}${offsetText}`
            : `${strings.poseGoing(label)} · ${strings.lastAsked}${offsetText}`;
  const running = !unconfirmed && (record.state === "going" || record.state === "moving");
  const cancelWords = localizeOperatorText(CANCEL_WORDS, language);
  return (
    <div className="bloom-position-progress" data-state={unconfirmed ? "unconfirmed" : record.state}>
      <p aria-live="polite" className="bloom-position-progress-text" role="status">
        <span>{text}</span>
        {running ? <span className="bloom-position-hint">{strings.posePadWaits}</span> : null}
      </p>
      {running || unconfirmed ? (
        <button className="bloom-position-cancel" onClick={onCancel} onKeyDown={ignoreKeyRepeat} type="button">
          {cancelWords}
        </button>
      ) : null}
    </div>
  );
}

function RenameField({
  name,
  onCancel,
  onSave,
  strings,
}: {
  name: string;
  onCancel: () => void;
  onSave: (newName: string) => void;
  strings: RendererStrings;
}) {
  const [value, setValue] = useState(name);
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const valid = POSE_NAME.test(normalized);
  const errorId = `${name}-rename-error`;
  return (
    <form
      className="bloom-position-rename-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          onSave(normalized);
        }
      }}
    >
      <input
        aria-describedby={valid ? undefined : errorId}
        aria-invalid={valid ? undefined : "true"}
        aria-label={strings.poseRenameField(name)}
        autoComplete="off"
        // The field replaces the row the operator just pressed Rename on.
        // biome-ignore lint/a11y/noAutofocus: focus follows the press that opened it.
        autoFocus
        className="bloom-position-rename-input"
        maxLength={64}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
        value={value}
      />
      <button className="bloom-position-rename" disabled={!valid} type="submit">
        {strings.poseRenameSave}
      </button>
      <button className="bloom-position-rename" onClick={onCancel} type="button">
        {strings.poseRenameCancel}
      </button>
      {valid ? null : (
        <span className="bloom-position-rename-error" id={errorId}>
          {strings.poseRenameInvalid}
        </span>
      )}
    </form>
  );
}

/** `pose_3` reads Pose 3 on the operator's list; the stored name, which the export uses, stays as it is. */
function poseLabel(name: string): string {
  const spaced = name.replace(/_+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : name;
}

/** The hand's position for an operator; the joint vector for the bench, which exports it. */
function describePose(pose: SavedPositionEntry, handFirst: boolean): string {
  if (handFirst && pose.eePose) {
    const [x, y, z] = pose.eePose.position;
    return `x ${x.toFixed(2)} \u00b7 y ${y.toFixed(2)} \u00b7 z ${z.toFixed(2)} m`;
  }
  return pose.positions.map((value) => value.toFixed(2)).join(" ");
}

function describeEvent(event: LibrarySnapshot["event"], strings: RendererStrings): string {
  if (!event) {
    return "";
  }
  const name = event.name ?? "";
  switch (event.kind) {
    case "saved":
      return strings.poseSaved(poseLabel(name));
    case "renamed":
      return strings.poseRenamed(name);
    case "deleted":
      return strings.poseDeleted(name);
    case "exported":
      return strings.poseExported;
  }
}

import type { ApplicationConfig, RuntimeLanguage, ScreenConfig } from "@bloom/api-client";
import { resolveCanvasPresetSize } from "@bloom/widgets";
import { type ReactNode, useEffect, useId, useState } from "react";

import type { RuntimeFitWarning } from "./runtime-canvas-fit";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import { useHoldGesture } from "./use-hold-gesture";

/**
 * The runtime's only chrome: one 44 px bar of status (design 1b, 10). Everything that leaves or changes the session
 * sits behind a deliberate 1.5 s hold, so brushing the glass while an arm moves cannot reach it.
 */

const MAINTENANCE_HOLD_MS = 1500;
const ROLE_SWITCH_HOLD_MS = 1500;

/** Word + color + dot shape carry the same message; never color alone. */
export type RuntimeStatusChipTone = "connecting" | "held" | "link-down" | "ready" | "stopped";

export type RuntimeStatusChip = {
  label: string;
  tone: RuntimeStatusChipTone;
};

export type RuntimeLinkFact = "connected" | "connecting" | "down" | null;

export type RuntimeProfileSummary = { id: string; layoutId: string; name: string };

export type RuntimeKioskBarProps = {
  application: ApplicationConfig;
  commandFeedback?: {
    detail: string;
    status: "blocked" | "failed" | "simulated" | "unsupported";
  } | null;
  controlOwnerLabel?: string | null;
  screen: ScreenConfig;
  profile: RuntimeProfileSummary;
  /** Every profile the app offers; a role switch picks one. */
  profiles?: readonly RuntimeProfileSummary[];
  /** The frame operator commands are stamped with, or null while unknown. */
  commandFrameId: string | null;
  gamepadName?: string | null;
  publishRateHz?: number;
  /** A control is sending motion right now. */
  publishing?: boolean;
  /** STOP or maintenance holds the robot at zeros. */
  held?: boolean;
  link?: RuntimeLinkFact;
  /** Omitted only where no runtime session exists (previews, tests). */
  statusChip?: RuntimeStatusChip;
  /** Pixels on the right the sheet leaves free, so it never sits under STOP. */
  sheetInsetRight?: number;
  diagnostics?: ReactNode;
  fitWarning?: RuntimeFitWarning | null;
  onSelectScreen: (screenId: string) => void;
  onOpenAppLibrary: () => void;
  onEditScreen: () => void;
  onEditApplication: () => void;
  onOpenLanding: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenSupervisor: () => void;
  onOpenTour: () => void;
  onReload?: () => void;
  onSuspendTeleop: () => void;
  onSwitchProfile?: (profileId: string) => void;
  onMaintenanceOpenChange?: (open: boolean) => void;
  language?: RuntimeLanguage;
  onLanguageChange: (language: RuntimeLanguage) => void;
};

export function resolveRuntimeRole(profile: Pick<RuntimeProfileSummary, "id" | "layoutId">): "bench" | "operator" {
  return profile.id === "bench" || profile.layoutId.endsWith("_bench") ? "bench" : "operator";
}

export function RuntimeKioskBar(props: RuntimeKioskBarProps) {
  const {
    application,
    commandFeedback,
    screen,
    profile,
    commandFrameId,
    publishRateHz = 30,
    publishing = false,
    held = false,
    statusChip,
    onSuspendTeleop,
    onMaintenanceOpenChange,
    language = "en",
  } = props;
  const strings = useRuntimeStrings(language);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const openMaintenance = () => {
    onSuspendTeleop();
    setMaintenanceOpen(true);
    onMaintenanceOpenChange?.(true);
  };
  const closeMaintenance = () => {
    setMaintenanceOpen(false);
    onMaintenanceOpenChange?.(false);
  };
  const holdProgress = useHoldGesture(MAINTENANCE_HOLD_MS, openMaintenance);
  const rate = held
    ? strings.kiosk.rateZerosHeld
    : publishing
      ? strings.kiosk.ratePublishing(publishRateHz)
      : strings.kiosk.rate(publishRateHz);

  return (
    <>
      <header className="runtime-kiosk-bar">
        {/* Level 2: level 1 belongs to the app configuration page. */}
        <h2 className="runtime-kiosk-app">{application.name}</h2>
        <span className="runtime-kiosk-screen">{screen.title}</span>
        {statusChip ? (
          <span className="runtime-kiosk-status" data-tone={statusChip.tone} role="status">
            <span aria-hidden="true" className="runtime-kiosk-status-dot" />
            {statusChip.label}
          </span>
        ) : null}
        {commandFrameId ? (
          <span className="runtime-kiosk-frame" title={strings.kiosk.referenceFrameTitle}>
            {commandFrameId}
          </span>
        ) : null}
        <span className="runtime-kiosk-rate" data-held={held ? "true" : undefined}>
          {rate}
        </span>
        {commandFeedback ? (
          <span
            aria-label={`${
              commandFeedback.status === "simulated" ? strings.kiosk.commandNotSent : strings.kiosk.commandFailed
            }: ${commandFeedback.detail}`}
            className="runtime-kiosk-command-feedback"
            data-status={commandFeedback.status}
            role="alert"
            title={commandFeedback.detail}
          >
            <strong>
              {commandFeedback.status === "simulated" ? strings.kiosk.commandNotSent : strings.kiosk.commandFailed}
            </strong>
            <span>{commandFeedback.detail}</span>
          </span>
        ) : null}
        <span className="runtime-kiosk-spacer" />
        <span className="runtime-kiosk-role" data-role={resolveRuntimeRole(profile)}>
          {profile.name}
        </span>
        <button
          aria-label={strings.kiosk.maintenanceAria}
          className="runtime-kiosk-maintenance"
          onKeyDown={(event) => {
            if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
              holdProgress.start();
            }
          }}
          onKeyUp={holdProgress.cancel}
          onPointerCancel={holdProgress.cancel}
          onPointerDown={holdProgress.start}
          onPointerLeave={holdProgress.cancel}
          onPointerUp={holdProgress.cancel}
          type="button"
        >
          <span
            aria-hidden="true"
            className="runtime-kiosk-hold"
            style={{ transform: `scaleX(${holdProgress.value})` }}
          />
          <span aria-hidden="true" className="runtime-kiosk-dots">
            ⋯
          </span>
        </button>
      </header>

      {maintenanceOpen ? (
        <RuntimeMaintenanceSheet {...props} onClose={closeMaintenance} rate={publishRateHz} strings={strings} />
      ) : null}
    </>
  );
}

/** Everything that is not operating the robot (design 6b): six facts to read, four actions, then the rest. */
function RuntimeMaintenanceSheet({
  application,
  commandFrameId,
  controlOwnerLabel,
  diagnostics,
  fitWarning,
  gamepadName,
  language = "en",
  link = null,
  onClose,
  onEditApplication,
  onEditScreen,
  onLanguageChange,
  onOpenAppLibrary,
  onOpenHelp,
  onOpenLanding,
  onOpenSettings,
  onOpenSupervisor,
  onOpenTour,
  onReload = () => window.location.reload(),
  onSelectScreen,
  onSwitchProfile,
  profile,
  profiles = [],
  rate,
  screen,
  sheetInsetRight = 0,
  strings,
}: RuntimeKioskBarProps & { onClose: () => void; rate: number; strings: RuntimeStrings }) {
  const [choosingRole, setChoosingRole] = useState(false);
  const roleHold = useHoldGesture(ROLE_SWITCH_HOLD_MS, () => setChoosingRole(true));
  const facts = strings.kiosk.facts;
  const { width: authoredWidth, height: authoredHeight } = resolveCanvasPresetSize(screen.canvas);
  const linkValue =
    link === "connected"
      ? strings.supervisor.status.connected
      : link === "connecting"
        ? strings.status.connecting
        : link === "down"
          ? strings.status.linkDown
          : facts.notReported;
  const closeAnd = (action: () => void) => () => {
    onClose();
    action();
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="runtime-maintenance-scrim" style={{ paddingRight: sheetInsetRight }}>
      <section
        aria-label={strings.kiosk.maintenance}
        aria-modal="true"
        className="runtime-maintenance-panel"
        role="dialog"
      >
        <header className="runtime-maintenance-head">
          <h2>{strings.kiosk.maintenance}</h2>
          <span className="runtime-maintenance-held">{strings.kiosk.heldBadge}</span>
          <button className="runtime-maintenance-close" onClick={onClose} type="button">
            {strings.kiosk.close}
          </button>
        </header>

        <dl className="runtime-maintenance-facts">
          <Fact
            label={facts.link}
            note={controlOwnerLabel ? `${facts.linkNote} · ${facts.youControl}` : facts.linkNote}
            value={linkValue}
          />
          <Fact label={facts.publishRate} note={facts.publishRateNote} value={strings.kiosk.rate(rate)} />
          <Fact label={facts.commandFrame} note={facts.commandFrameNote} value={commandFrameId ?? facts.notReported} />
          <Fact label={facts.profile} note={profile.layoutId || screen.id} value={profile.name} />
          <Fact
            label={facts.deviceClass}
            note={
              gamepadName
                ? `${facts.deviceNote(authoredWidth, authoredHeight)} · ${facts.gamepadConnected(gamepadName)}`
                : facts.deviceNote(authoredWidth, authoredHeight)
            }
            value={window.innerWidth >= 1600 ? facts.deviceDesktop : facts.deviceTablet}
          />
          <Fact label={facts.appVersion} note={application.name} value={application.id} />
        </dl>

        {fitWarning ? (
          <div className="runtime-maintenance-fit-warning" role="alert">
            <strong>{strings.kiosk.fitTitle}</strong>
            <p>
              {strings.kiosk.fitDescription(
                fitWarning.authoredWidth,
                fitWarning.authoredHeight,
                fitWarning.shownPercent,
              )}
            </p>
          </div>
        ) : null}

        <h3 className="runtime-maintenance-group">{strings.kiosk.actions}</h3>
        <div className="runtime-maintenance-actions">
          <ActionButton
            hint={strings.kiosk.settingsHint}
            label={strings.kiosk.settings}
            onClick={closeAnd(onOpenSettings)}
          />
          {onSwitchProfile && profiles.length > 1 ? (
            <button
              aria-label={strings.kiosk.switchRoleAria}
              className="runtime-maintenance-action"
              onKeyDown={(event) => {
                if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
                  roleHold.start();
                }
              }}
              onKeyUp={roleHold.cancel}
              onPointerCancel={roleHold.cancel}
              onPointerDown={roleHold.start}
              onPointerLeave={roleHold.cancel}
              onPointerUp={roleHold.cancel}
              type="button"
            >
              <span
                aria-hidden="true"
                className="runtime-maintenance-action-hold"
                style={{ transform: `scaleX(${roleHold.value})` }}
              />
              <strong>{strings.kiosk.switchRole}</strong>
              <span>{strings.kiosk.switchRoleHint}</span>
            </button>
          ) : null}
          <ActionButton hint={strings.kiosk.reloadHint} label={strings.kiosk.reload} onClick={onReload} />
          <ActionButton
            danger
            hint={strings.kiosk.exitHint}
            label={strings.kiosk.exitToLibrary}
            onClick={closeAnd(onOpenAppLibrary)}
          />
        </div>

        {choosingRole ? (
          <fieldset className="runtime-maintenance-roles">
            <legend>{strings.kiosk.switchRoleChoose}</legend>
            {profiles.map((candidate) => (
              <button
                aria-pressed={candidate.id === profile.id}
                data-role={resolveRuntimeRole(candidate)}
                key={candidate.id}
                onClick={closeAnd(() => onSwitchProfile?.(candidate.id))}
                type="button"
              >
                {candidate.name}
              </button>
            ))}
          </fieldset>
        ) : null}

        <h3 className="runtime-maintenance-group">{strings.kiosk.more}</h3>
        {application.screens.length > 1 ? (
          <nav aria-label={strings.kiosk.switchScreen} className="runtime-maintenance-screens">
            {application.screens.map((candidate) => (
              <button
                aria-current={candidate.id === screen.id ? "page" : undefined}
                key={candidate.id}
                onClick={closeAnd(() => onSelectScreen(candidate.id))}
                type="button"
              >
                {candidate.title}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="runtime-maintenance-tools">
          <button onClick={closeAnd(onOpenTour)} type="button">
            {strings.settings.practiceTour}
          </button>
          <button onClick={closeAnd(onOpenSupervisor)} type="button">
            {strings.kiosk.supervisorMirror}
          </button>
          <button onClick={onEditScreen} type="button">
            {strings.kiosk.editScreen}
          </button>
          <button onClick={onEditApplication} type="button">
            {strings.kiosk.editApp}
          </button>
          <button onClick={onOpenHelp} type="button">
            {strings.kiosk.help}
          </button>
          <button onClick={onOpenLanding} type="button">
            {strings.kiosk.home}
          </button>
          <fieldset className="runtime-maintenance-languages">
            <legend className="sr-only">{strings.settings.categories.language}</legend>
            {(["en", "es", "fr"] as const).map((candidate) => (
              <button
                aria-pressed={language === candidate}
                key={candidate}
                onClick={() => onLanguageChange(candidate)}
                type="button"
              >
                {candidate.toUpperCase()}
              </button>
            ))}
          </fieldset>
        </div>

        {diagnostics ? <div className="runtime-maintenance-diagnostics">{diagnostics}</div> : null}

        <footer className="runtime-maintenance-footer">
          <p>{strings.kiosk.resumeNote}</p>
          <button className="runtime-maintenance-return" onClick={onClose} type="button">
            {strings.kiosk.resume}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Fact({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="runtime-maintenance-fact">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        <span>{note}</span>
      </dd>
    </div>
  );
}

function ActionButton({
  danger = false,
  hint,
  label,
  onClick,
}: {
  danger?: boolean;
  hint: string;
  label: string;
  onClick: () => void;
}) {
  const hintId = useId();
  return (
    <button
      aria-describedby={hintId}
      aria-label={label}
      className="runtime-maintenance-action"
      data-danger={danger ? "true" : undefined}
      onClick={onClick}
      type="button"
    >
      <strong>{label}</strong>
      <span id={hintId}>{hint}</span>
    </button>
  );
}

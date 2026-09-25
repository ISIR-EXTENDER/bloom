import { localizeOperatorText, resolveCanvasPresetSize } from "@bloom/widgets";
import { useEffect, useId, useRef, useState } from "react";
import { type RuntimeKioskBarProps, resolveRuntimeRole } from "./RuntimeKioskBar";
import type { RuntimeStrings } from "./strings";
import { useDwellActivation } from "./use-dwell-activation";
import { useHoldGesture } from "./use-hold-gesture";
import { useSwitchScanning } from "./use-switch-scanning";

const ROLE_SWITCH_HOLD_MS = 1500;
const DIALOG_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Everything that is not operating the robot (design 6b): six facts to read, four actions, then the rest. */
export function RuntimeMaintenanceSheet({
  application,
  commandFrameId,
  ownsRobotControl = false,
  diagnostics,
  dwell,
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
  scanning,
  screen,
  sheetInsetRight = 0,
  strings,
}: RuntimeKioskBarProps & { onClose: () => void; rate: number; strings: RuntimeStrings }) {
  const [choosingRole, setChoosingRole] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const roleHold = useHoldGesture(ROLE_SWITCH_HOLD_MS, () => setChoosingRole(true));
  // The sheet is the scan root while it is open, so Settings, a screen change
  // and Resume operating stay reachable by switch.
  const sheetScanning = useSwitchScanning({
    enabled: scanning?.enabled === true,
    periodMs: scanning?.periodMs ?? 1200,
    rootRef: panelRef,
    revision: `${choosingRole}:${screen.id}`,
  });
  // And the dwell root: without it a dwell operator who opened the sheet could
  // reach neither Close nor anything inside it.
  useDwellActivation({
    dwellMs: dwell?.dwellMs ?? 800,
    enabled: dwell?.enabled === true,
    rootRef: panelRef,
  });
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

  // aria-modal hides the artboard from screen readers, so Tab must not walk
  // into it. Focus starts on the dialog and stays inside until it closes.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    panel.focus();

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const focusable = [...panel.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !panel.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keepFocusInside, true);
    return () => document.removeEventListener("keydown", keepFocusInside, true);
  }, []);

  return (
    <div className="runtime-maintenance-scrim" style={{ paddingRight: sheetInsetRight }}>
      <section
        aria-label={strings.kiosk.maintenance}
        aria-modal="true"
        className="runtime-maintenance-panel"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="runtime-maintenance-head">
          <h2>{strings.kiosk.maintenance}</h2>
          <span className="runtime-maintenance-held">{strings.kiosk.heldBadge}</span>
          <button className="runtime-maintenance-close" onClick={onClose} type="button">
            {strings.kiosk.close}
          </button>
        </header>

        {/* Only the middle scrolls: Close and Resume operating stay on screen at any height. */}
        <div className="runtime-maintenance-body">
          {application.screens.length > 1 ? (
            <>
              <h3 className="runtime-maintenance-group">{strings.kiosk.screens}</h3>
              <nav aria-label={strings.kiosk.switchScreen} className="runtime-maintenance-screens">
                {application.screens.map((candidate) => (
                  <button
                    aria-current={candidate.id === screen.id ? "page" : undefined}
                    key={candidate.id}
                    onClick={closeAnd(() => onSelectScreen(candidate.id))}
                    type="button"
                  >
                    {localizeOperatorText(candidate.title, language)}
                  </button>
                ))}
              </nav>
            </>
          ) : null}
          <dl className="runtime-maintenance-facts">
            <Fact
              label={facts.link}
              note={ownsRobotControl ? `${facts.linkNote} · ${facts.youControl}` : facts.linkNote}
              value={linkValue}
            />
            <Fact label={facts.publishRate} note={facts.publishRateNote} value={strings.kiosk.rate(rate)} />
            <Fact
              label={facts.commandFrame}
              note={facts.commandFrameNote}
              value={commandFrameId ?? facts.notReported}
            />
            <Fact
              label={facts.profile}
              note={profile.layoutId || screen.id}
              value={localizeOperatorText(profile.name, language)}
            />
            <Fact
              label={facts.deviceClass}
              note={
                gamepadName
                  ? `${facts.deviceNote(authoredWidth, authoredHeight)} · ${facts.gamepadConnected(gamepadName)}`
                  : facts.deviceNote(authoredWidth, authoredHeight)
              }
              value={window.innerWidth >= 1600 ? facts.deviceDesktop : facts.deviceTablet}
            />
            <Fact label={facts.app} note={application.name} value={application.id} />
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
                onBlur={roleHold.cancel}
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
                  {localizeOperatorText(candidate.name, language)}
                </button>
              ))}
            </fieldset>
          ) : null}

          <h3 className="runtime-maintenance-group">{strings.kiosk.more}</h3>
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
              <legend className="sr-only">{strings.settings.language}</legend>
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
        </div>

        <footer className="runtime-maintenance-footer">
          <p>{strings.kiosk.resumeNote}</p>
          {sheetScanning.index >= 0 ? (
            <>
              <button
                className="runtime-maintenance-switch"
                data-scan-switch=""
                onClick={sheetScanning.activateCurrent}
                type="button"
              >
                {strings.scan.button}
              </button>
              <p aria-live="polite" className="sr-only" role="status">
                {strings.scan.progress(sheetScanning.index + 1, sheetScanning.targetCount)}
              </p>
            </>
          ) : null}
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

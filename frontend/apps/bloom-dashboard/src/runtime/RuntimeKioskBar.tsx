import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The runtime's only chrome.
 *
 * The runtime used to wear the builder's clothes: an eyebrow reading "Runtime
 * app", the app name, the profile name, the active screen name, a row of screen
 * tabs and a menu holding six ways out -- Home, App library, Builder, Help,
 * Edit app, Edit screen -- with a diagnostics strip under all of it. On the
 * 1024x600 operator panel that measured 121px of the 600 available, before a
 * single control, and every one of those exits was one stray tap away while an
 * arm mounted to someone's chair was moving.
 *
 * `docs/design-system.md` already forbade it: "No builder chrome, inspector
 * controls, or edit metadata should appear in runtime."
 *
 * So there is one 44px bar, and everything that leaves the session sits behind a
 * deliberate 1.5s hold. The hold is the point: it cannot be done by brushing the
 * glass, which is how a wheelchair-mounted arm gets driven by someone whose eyes
 * are on the gripper rather than the screen.
 */

const MAINTENANCE_HOLD_MS = 1500;
const HOLD_TICK_MS = 40;

export type RuntimeKioskBarProps = {
  application: ApplicationConfig;
  screen: ScreenConfig;
  profileName: string;
  /**
   * The frame operator commands are stamped with, or null while unknown.
   *
   * Named on screen because `cartesian_manager` does no TF conversion: a
   * command in any other frame is dropped and the arm stops, which looks
   * exactly like a broken UI (finding 11).
   *
   * There is deliberately no latency readout here yet. The spec asks for one,
   * but nothing in the stack measures round-trip time, and a number that is not
   * measured is worse than an empty slot.
   */
  commandFrameId: string | null;
  /** Topic diagnostics, shown inside maintenance rather than over the controls. */
  diagnostics?: ReactNode;
  onSelectScreen: (screenId: string) => void;
  onOpenAppLibrary: () => void;
  onEditScreen: () => void;
  onEditApplication: () => void;
  onOpenLanding: () => void;
  onOpenHelp: () => void;
};

export function RuntimeKioskBar({
  application,
  screen,
  profileName,
  commandFrameId,
  diagnostics,
  onSelectScreen,
  onOpenAppLibrary,
  onEditScreen,
  onEditApplication,
  onOpenLanding,
  onOpenHelp,
}: RuntimeKioskBarProps) {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const holdProgress = useHoldToOpen(() => setMaintenanceOpen(true));

  return (
    <>
      <header className="runtime-kiosk-bar" aria-label="Runtime status">
        {/* Stays a heading, at level 2: level 1 belongs to the app
            configuration page, and the runtime must not claim it. */}
        <h2 className="runtime-kiosk-app">{application.name}</h2>
        {commandFrameId ? (
          <span className="runtime-kiosk-frame" title="Reference frame for operator commands">
            {commandFrameId}
          </span>
        ) : null}
        <span className="runtime-kiosk-spacer" />
        <span className="runtime-kiosk-profile">{profileName}</span>
        <button
          aria-label="Hold to open maintenance"
          className="runtime-kiosk-maintenance"
          onPointerCancel={holdProgress.cancel}
          onPointerDown={holdProgress.start}
          onPointerLeave={holdProgress.cancel}
          onPointerUp={holdProgress.cancel}
          type="button"
        >
          <span aria-hidden="true">☰</span>
          <span className="runtime-kiosk-hold" style={{ transform: `scaleX(${holdProgress.value})` }} />
        </button>
      </header>

      {maintenanceOpen ? (
        <RuntimeMaintenanceOverlay
          application={application}
          onClose={() => setMaintenanceOpen(false)}
          onEditApplication={onEditApplication}
          onEditScreen={onEditScreen}
          onOpenAppLibrary={onOpenAppLibrary}
          onOpenHelp={onOpenHelp}
          onOpenLanding={onOpenLanding}
          onSelectScreen={onSelectScreen}
          screen={screen}
        >
          {diagnostics}
        </RuntimeMaintenanceOverlay>
      ) : null}
    </>
  );
}

/**
 * Progress of a press toward opening maintenance, 0..1.
 *
 * Any release or leave cancels and resets to zero, so a half-finished press
 * cannot be completed later by someone who did not start it. The timer is
 * cleared on unmount because it outlives the component otherwise.
 */
function useHoldToOpen(onComplete: () => void) {
  const [value, setValue] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stop = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => stop, []);

  return {
    value,
    start: () => {
      stop();
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const progress = Math.min(1, (Date.now() - startedAt) / MAINTENANCE_HOLD_MS);
        setValue(progress);
        if (progress >= 1) {
          stop();
          setValue(0);
          onCompleteRef.current();
        }
      }, HOLD_TICK_MS);
    },
    cancel: () => {
      stop();
      setValue(0);
    },
  };
}

/**
 * Everything that is not operating the robot.
 *
 * Screen switching lives here rather than in the bar. The bar is deliberately
 * only status, and a stray tap on a screen tab mid-session swaps the controls
 * under the operator's hand.
 */
function RuntimeMaintenanceOverlay({
  children,
  application,
  screen,
  onSelectScreen,
  onOpenAppLibrary,
  onEditScreen,
  onEditApplication,
  onOpenLanding,
  onOpenHelp,
  onClose,
}: {
  children?: ReactNode;
  application: ApplicationConfig;
  screen: ScreenConfig;
  onSelectScreen: (screenId: string) => void;
  onOpenAppLibrary: () => void;
  onEditScreen: () => void;
  onEditApplication: () => void;
  onOpenLanding: () => void;
  onOpenHelp: () => void;
  onClose: () => void;
}) {
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
    <div className="runtime-maintenance-scrim">
      <section aria-label="Maintenance" className="runtime-maintenance-panel" role="dialog" aria-modal="true">
        <header>
          <h2>Maintenance</h2>
          <p>Held for 1.5s. The robot keeps its last commanded state while this is open.</p>
        </header>

        {application.screens.length > 1 ? (
          <nav aria-label="Switch runtime screen" className="runtime-maintenance-screens">
            {application.screens.map((candidate) => (
              <button
                aria-current={candidate.id === screen.id ? "page" : undefined}
                key={candidate.id}
                onClick={() => {
                  onSelectScreen(candidate.id);
                  onClose();
                }}
                type="button"
              >
                {candidate.title}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="runtime-maintenance-actions">
          <button onClick={onOpenAppLibrary} type="button">
            App library
          </button>
          <button onClick={onEditScreen} type="button">
            Edit this screen in the builder
          </button>
          <button onClick={onEditApplication} type="button">
            Edit app
          </button>
          <button onClick={onOpenHelp} type="button">
            Help
          </button>
          <button onClick={onOpenLanding} type="button">
            Home
          </button>
        </div>

        {children ? <div className="runtime-maintenance-diagnostics">{children}</div> : null}

        <button className="runtime-maintenance-return" onClick={onClose} type="button">
          Back to operation
        </button>
      </section>
    </div>
  );
}

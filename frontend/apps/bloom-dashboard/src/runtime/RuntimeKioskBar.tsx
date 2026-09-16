import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { type ReactNode, useEffect, useState } from "react";

import type { RuntimeFitWarning } from "./runtime-canvas-fit";
import { useHoldGesture } from "./use-hold-gesture";

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

/** Word + color + dot shape carry the same message; never color alone. */
export type RuntimeStatusChipTone = "connecting" | "link-down" | "ready" | "stopped";

export type RuntimeStatusChip = {
  label: string;
  tone: RuntimeStatusChipTone;
};

export type RuntimeKioskBarProps = {
  application: ApplicationConfig;
  screen: ScreenConfig;
  profileName: string;
  /**
   * The frame operator commands are stamped with, or null while unknown.
   *
   * Named on screen because it decides whether rotation follows the robot base,
   * end effector, or hybrid operator mapping (finding 11).
   *
   * There is deliberately no latency readout here yet. The spec asks for one,
   * but nothing in the stack measures round-trip time, and a number that is not
   * measured is worse than an empty slot.
   */
  commandFrameId: string | null;
  /** A connected physical input, named so the operator knows it is live. */
  gamepadName?: string | null;
  /** Which arm this backend drives; null while unknown or unconfigured. */
  robotName?: string | null;
  /** Omitted only where no runtime session exists (previews, tests). */
  statusChip?: RuntimeStatusChip;
  /** Topic diagnostics, shown inside maintenance rather than over the controls. */
  diagnostics?: ReactNode;
  /** Unsafe fit details, disclosed only after entering Maintenance. */
  fitWarning?: RuntimeFitWarning | null;
  onSelectScreen: (screenId: string) => void;
  onOpenAppLibrary: () => void;
  onEditScreen: () => void;
  onEditApplication: () => void;
  onOpenLanding: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
};

export function RuntimeKioskBar({
  application,
  screen,
  profileName,
  commandFrameId,
  gamepadName,
  robotName,
  statusChip,
  diagnostics,
  fitWarning,
  onSelectScreen,
  onOpenAppLibrary,
  onEditScreen,
  onEditApplication,
  onOpenLanding,
  onOpenHelp,
  onOpenSettings,
}: RuntimeKioskBarProps) {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const holdProgress = useHoldGesture(MAINTENANCE_HOLD_MS, () => setMaintenanceOpen(true));

  return (
    <>
      <header className="runtime-kiosk-bar">
        {/* Stays a heading, at level 2: level 1 belongs to the app
            configuration page, and the runtime must not claim it. */}
        <h2 className="runtime-kiosk-app">{application.name}</h2>
        {statusChip ? (
          <span className="runtime-kiosk-status" data-tone={statusChip.tone} role="status">
            <span aria-hidden="true" className="runtime-kiosk-status-dot" />
            {statusChip.label}
          </span>
        ) : null}
        {robotName ? (
          <span className="runtime-kiosk-robot" title="Robot this backend drives">
            {robotName}
          </span>
        ) : null}
        {commandFrameId ? (
          <span className="runtime-kiosk-frame" title="Reference frame for operator commands">
            {commandFrameId}
          </span>
        ) : null}
        {gamepadName ? (
          <span className="runtime-kiosk-gamepad" title={gamepadName}>
            gamepad
          </span>
        ) : null}
        <span className="runtime-kiosk-spacer" />
        <span className="runtime-kiosk-profile">{profileName}</span>
        <button
          aria-label="Hold to open maintenance"
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
          <span aria-hidden="true">☰</span>
          <span className="runtime-kiosk-hold" style={{ transform: `scaleX(${holdProgress.value})` }} />
        </button>
      </header>

      {maintenanceOpen ? (
        <RuntimeMaintenanceOverlay
          application={application}
          fitWarning={fitWarning}
          onClose={() => setMaintenanceOpen(false)}
          onEditApplication={onEditApplication}
          onEditScreen={onEditScreen}
          onOpenAppLibrary={onOpenAppLibrary}
          onOpenHelp={onOpenHelp}
          onOpenLanding={onOpenLanding}
          onOpenSettings={() => {
            setMaintenanceOpen(false);
            onOpenSettings();
          }}
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
 * Everything that is not operating the robot.
 *
 * Screen switching lives here rather than in the bar. The bar is deliberately
 * only status, and a stray tap on a screen tab mid-session swaps the controls
 * under the operator's hand.
 */
function RuntimeMaintenanceOverlay({
  children,
  application,
  fitWarning,
  screen,
  onSelectScreen,
  onOpenAppLibrary,
  onEditScreen,
  onEditApplication,
  onOpenLanding,
  onOpenHelp,
  onOpenSettings,
  onClose,
}: {
  children?: ReactNode;
  application: ApplicationConfig;
  fitWarning?: RuntimeFitWarning | null;
  screen: ScreenConfig;
  onSelectScreen: (screenId: string) => void;
  onOpenAppLibrary: () => void;
  onEditScreen: () => void;
  onEditApplication: () => void;
  onOpenLanding: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
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

        {fitWarning ? (
          <div className="runtime-maintenance-fit-warning" role="alert">
            <strong>Touch targets scaled down</strong>
            <p>
              {`Composed for ${fitWarning.authoredWidth} × ${fitWarning.authoredHeight}, shown at ${fitWarning.shownPercent}%. Targets may be below the 44 px touch floor.`}
            </p>
          </div>
        ) : null}

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
          <button onClick={onOpenSettings} type="button">
            Settings
          </button>
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

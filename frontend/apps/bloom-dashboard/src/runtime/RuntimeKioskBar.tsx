import type { ApplicationConfig, RuntimeLanguage, ScreenConfig } from "@bloom/api-client";
import { localizeOperatorText } from "@bloom/widgets";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAssistiveActivation } from "./assistive-activation";
import { RuntimeMaintenanceSheet } from "./RuntimeMaintenanceSheet";
import type { RuntimeFitWarning } from "./runtime-canvas-fit";
import { useRuntimeStrings } from "./strings";
import { useHoldGesture } from "./use-hold-gesture";

/**
 * The runtime's only chrome: one 44 px bar of status (design 1b, 10). Everything that leaves or changes the session
 * sits behind a deliberate 1.5 s hold, so brushing the glass while an arm moves cannot reach it.
 */

const MAINTENANCE_HOLD_MS = 1500;
const HOLD_HINT_MS = 2600;

/** Word + color + dot shape carry the same message; never color alone. */
export type RuntimeStatusChipTone =
  | "connecting"
  | "debug"
  | "held"
  | "link-down"
  | "not-in-control"
  | "ready"
  | "stopped";

export type RuntimeStatusChip = {
  label: string;
  tone: RuntimeStatusChipTone;
};

export type RuntimeLinkFact = "connected" | "connecting" | "down" | null;

/** `menuOnTap` roles open maintenance with a tap; the others need the hold. */
export type RuntimeProfileSummary = { id: string; layoutId: string; menuOnTap?: boolean; name: string };

export type RuntimeKioskBarProps = {
  application: ApplicationConfig;
  commandFeedback?: {
    detail: string;
    status: "blocked" | "failed" | "simulated" | "unsupported";
  } | null;
  ownsRobotControl?: boolean;
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
  /** The profile's switch scanning, which the sheet takes over while it is open. */
  scanning?: { enabled: boolean; periodMs: number };
  /** The profile's pointer dwell, which the sheet takes over the same way. */
  dwell?: { dwellMs: number; enabled: boolean };
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
  /** The first-entry practice offer; null once answered or once the tour has been walked. */
  tourOffer?: { onAccept: () => void; onDismiss: () => void } | null;
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
    tourOffer = null,
  } = props;
  const strings = useRuntimeStrings(language);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const maintenanceButtonRef = useRef<HTMLButtonElement | null>(null);
  const openMaintenance = () => {
    // Hold first, then zero: a held control's next tick is refused rather than resuming motion.
    onMaintenanceOpenChange?.(true);
    onSuspendTeleop();
    setMaintenanceOpen(true);
  };
  const closeMaintenance = () => {
    setMaintenanceOpen(false);
    onMaintenanceOpenChange?.(false);
    maintenanceButtonRef.current?.focus();
  };
  const holdProgress = useHoldGesture(MAINTENANCE_HOLD_MS, openMaintenance);
  // A tap on ⋯ used to do nothing visible, so nobody learnt that it opens when held. Released early, it says so.
  const pressedAt = useRef<number | null>(null);
  const [holdHint, setHoldHint] = useState(false);
  useEffect(() => {
    if (!holdHint) {
      return;
    }
    const timer = setTimeout(() => setHoldHint(false), HOLD_HINT_MS);
    return () => clearTimeout(timer);
  }, [holdHint]);
  const pressMaintenance = () => {
    pressedAt.current = Date.now();
    setHoldHint(false);
    holdProgress.start();
  };
  const releaseMaintenance = () => {
    const heldFor = pressedAt.current === null ? null : Date.now() - pressedAt.current;
    pressedAt.current = null;
    holdProgress.cancel();
    if (heldFor !== null && heldFor < MAINTENANCE_HOLD_MS) {
      setHoldHint(true);
    }
  };
  // A switch cannot hold anything down: selecting this button under scanning is
  // itself the slow, deliberate act the hold asks a pointer for.
  const maintenanceRef = useAssistiveActivation<HTMLButtonElement>(openMaintenance, maintenanceButtonRef);
  const menuOnTap = profile.menuOnTap === true;
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
        {menuOnTap ? (
          <button
            aria-label={strings.kiosk.screenMenuAria(localizeOperatorText(screen.title, language))}
            className="runtime-kiosk-screen"
            data-menu="true"
            onClick={openMaintenance}
            type="button"
          >
            {localizeOperatorText(screen.title, language)}
          </button>
        ) : (
          <span className="runtime-kiosk-screen">{localizeOperatorText(screen.title, language)}</span>
        )}
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
        {tourOffer ? (
          <fieldset className="runtime-kiosk-tour-offer">
            <legend className="sr-only">{strings.tour.offerAria}</legend>
            <button onClick={tourOffer.onAccept} type="button">
              {strings.tour.offerStart}
            </button>
            <button aria-label={strings.tour.offerDismiss} onClick={tourOffer.onDismiss} type="button">
              ×
            </button>
          </fieldset>
        ) : null}
        <span className="runtime-kiosk-spacer" />
        <span className="runtime-kiosk-role" data-role={resolveRuntimeRole(profile)}>
          {localizeOperatorText(profile.name, language)}
        </span>
        {menuOnTap ? (
          <button
            aria-label={strings.kiosk.menuAria}
            className="runtime-kiosk-maintenance"
            data-assistive-maintenance=""
            onClick={openMaintenance}
            ref={maintenanceRef}
            type="button"
          >
            <span aria-hidden="true" className="runtime-kiosk-dots">
              ⋯
            </span>
          </button>
        ) : (
          <button
            aria-label={strings.kiosk.maintenanceAria}
            className="runtime-kiosk-maintenance"
            data-assistive-maintenance=""
            onBlur={holdProgress.cancel}
            onKeyDown={(event) => {
              if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
                pressMaintenance();
              }
            }}
            onKeyUp={releaseMaintenance}
            onPointerCancel={holdProgress.cancel}
            onPointerDown={pressMaintenance}
            onPointerLeave={holdProgress.cancel}
            onPointerUp={releaseMaintenance}
            ref={maintenanceRef}
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
        )}
        {holdHint ? (
          <span className="runtime-kiosk-hold-hint" role="status">
            {strings.kiosk.holdHint}
          </span>
        ) : null}
      </header>

      {maintenanceOpen ? (
        <RuntimeMaintenanceSheet {...props} onClose={closeMaintenance} rate={publishRateHz} strings={strings} />
      ) : null}
    </>
  );
}

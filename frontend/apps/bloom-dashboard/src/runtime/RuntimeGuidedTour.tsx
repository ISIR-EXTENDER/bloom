import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { isRecord, localizeOperatorText } from "@bloom/widgets";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { guidedTourProgressKey, useGuidedTourProgress } from "../ui/guided-tour-progress";
import type { ResolvedRuntimeProfile } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import { useDwellActivation } from "./use-dwell-activation";
import { useHoldGesture } from "./use-hold-gesture";
import { useSwitchScanning } from "./use-switch-scanning";

type RuntimeTourStepId = "screen" | "move" | "stop" | "settings" | "ready";

type RuntimeGuidedTourProps = {
  application: ApplicationConfig;
  onDone: () => void;
  profile: ResolvedRuntimeProfile;
  screen: ScreenConfig;
  selection: WorkspaceSelection;
};

const STEP_IDS: readonly RuntimeTourStepId[] = ["screen", "move", "stop", "settings", "ready"];
const MAINTENANCE_HOLD_MS = 1500;
const RESUME_HOLD_MS = 1000;

export function RuntimeGuidedTour({ application, onDone, profile, screen, selection }: RuntimeGuidedTourProps) {
  const strings = useRuntimeStrings(profile.language);
  const rootRef = useRef<HTMLElement | null>(null);
  const tourKey = guidedTourProgressKey("runtime", selection.configId, selection.appId);
  const { completedStepIds, completeStep } = useGuidedTourProgress(tourKey);
  const [activeStepId, setActiveStepId] = useState<RuntimeTourStepId>(
    () => STEP_IDS.find((stepId) => !completedStepIds.includes(stepId)) ?? "screen",
  );
  const [moveCount, setMoveCount] = useState(0);
  const [practiceStopped, setPracticeStopped] = useState(false);
  const movement = useMemo(() => resolvePracticeMovement(application, strings), [application, strings]);
  const scanning = useSwitchScanning({
    enabled: profile.motorAccessibilityPreset === "scan",
    periodMs: profile.scanPeriodMs,
    revision: activeStepId,
    rootRef,
  });
  useDwellActivation({ dwellMs: profile.dwellMs, enabled: profile.dwellEnabled, rootRef });
  // Practice replaces the controls; focus goes to it, not to <body>.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const finishStep = (stepId: RuntimeTourStepId) => {
    completeStep(stepId);
    const nextStepId = STEP_IDS[STEP_IDS.indexOf(stepId) + 1];
    if (nextStepId) {
      setActiveStepId(nextStepId);
    }
  };

  return (
    <section
      aria-label={strings.tour.title}
      className="runtime-guided-tour"
      data-runtime-scanning={scanning.index >= 0 ? "true" : "false"}
      ref={rootRef}
      style={{ "--runtime-font-scale": profile.fontScale } as CSSProperties}
      tabIndex={-1}
    >
      <header className="runtime-tour-header">
        <div>
          <strong>{strings.tour.title}</strong>
          <span>{strings.tour.localOnly}</span>
        </div>
        <button aria-label={strings.tour.close} onClick={onDone} title={strings.tour.close} type="button">
          ×
        </button>
      </header>

      <div className="runtime-tour-body">
        <nav aria-label={strings.tour.stepsLabel} className="runtime-tour-rail">
          {STEP_IDS.map((stepId, index) => {
            const step = strings.tour.steps[stepId];
            const complete = completedStepIds.includes(stepId);
            return (
              <button
                aria-current={activeStepId === stepId ? "step" : undefined}
                className="runtime-tour-step"
                key={stepId}
                onClick={() => setActiveStepId(stepId)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <span aria-hidden="true">{complete ? "✓" : ""}</span>
                {complete ? <span className="sr-only">{strings.tour.complete}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="runtime-tour-main">
          <div
            aria-label={strings.tour.progress(completedStepIds.length, 5)}
            aria-valuemax={5}
            aria-valuemin={0}
            aria-valuenow={completedStepIds.length}
            className="runtime-tour-progress"
            role="progressbar"
          >
            <span style={{ transform: `scaleX(${completedStepIds.length / 5})` }} />
          </div>
          <p className="runtime-tour-disconnected">{strings.tour.disconnected}</p>
          <RuntimeTourStep
            activeStepId={activeStepId}
            applicationName={application.name}
            finishStep={finishStep}
            moveCount={moveCount}
            movement={movement}
            onDone={onDone}
            practiceStopped={practiceStopped}
            screenTitle={localizeOperatorText(screen.title, strings.language)}
            setMoveCount={setMoveCount}
            setPracticeStopped={setPracticeStopped}
            strings={strings}
          />
        </div>
      </div>

      {scanning.index >= 0 ? (
        <div className="runtime-tour-switch">
          <button data-scan-switch="" onClick={scanning.activateCurrent} type="button">
            {strings.scan.button}
          </button>
          <p aria-live="off" className="sr-only">
            {strings.scan.progress(scanning.index + 1, scanning.targetCount)}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function RuntimeTourStep({
  activeStepId,
  applicationName,
  finishStep,
  moveCount,
  movement,
  onDone,
  practiceStopped,
  screenTitle,
  setMoveCount,
  setPracticeStopped,
  strings,
}: {
  activeStepId: RuntimeTourStepId;
  applicationName: string;
  finishStep: (stepId: RuntimeTourStepId) => void;
  moveCount: number;
  movement: PracticeMovement;
  onDone: () => void;
  practiceStopped: boolean;
  screenTitle: string;
  setMoveCount: (count: number) => void;
  setPracticeStopped: (stopped: boolean) => void;
  strings: RuntimeStrings;
}) {
  const step = strings.tour.steps[activeStepId];

  return (
    <article className="runtime-tour-panel">
      <div>
        <p className="runtime-settings-eyebrow">{strings.tour.practice}</p>
        <h2>{step.title}</h2>
        <p>{resolveStepBody(activeStepId, strings, applicationName, screenTitle, movement, moveCount)}</p>
      </div>
      <aside>
        <strong>{strings.tour.whyTitle}</strong>
        <p>{step.why}</p>
      </aside>
      <div className="runtime-tour-action">
        {activeStepId === "screen" ? (
          <button onClick={() => finishStep("screen")} type="button">
            {step.action}
          </button>
        ) : null}
        {activeStepId === "move" ? (
          <button
            onClick={() => {
              const nextCount = moveCount + 1;
              setMoveCount(nextCount);
              if (nextCount >= 2) {
                finishStep("move");
              }
            }}
            type="button"
          >
            {movement.directionLabel}
          </button>
        ) : null}
        {activeStepId === "stop" ? (
          <TourStopPractice
            onComplete={() => finishStep("stop")}
            practiceStopped={practiceStopped}
            setPracticeStopped={setPracticeStopped}
            strings={strings}
          />
        ) : null}
        {activeStepId === "settings" ? (
          <TourMaintenancePractice onComplete={() => finishStep("settings")} strings={strings} />
        ) : null}
        {activeStepId === "ready" ? (
          <button
            onClick={() => {
              finishStep("ready");
              onDone();
            }}
            type="button"
          >
            {step.action}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TourStopPractice({
  onComplete,
  practiceStopped,
  setPracticeStopped,
  strings,
}: {
  onComplete: () => void;
  practiceStopped: boolean;
  setPracticeStopped: (stopped: boolean) => void;
  strings: RuntimeStrings;
}) {
  const resumeHold = useHoldGesture(RESUME_HOLD_MS, () => {
    setPracticeStopped(false);
    onComplete();
  });

  if (!practiceStopped) {
    return (
      <button className="runtime-tour-stop" onClick={() => setPracticeStopped(true)} type="button">
        {strings.stop.engage}
      </button>
    );
  }

  return (
    <button
      aria-label={strings.stop.resumeAria}
      className="runtime-tour-stop"
      data-dwell-min-ms={RESUME_HOLD_MS}
      onClick={(event) => {
        if (event.detail === 0) {
          setPracticeStopped(false);
          onComplete();
        }
      }}
      onKeyDown={(event) => {
        if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
          resumeHold.start();
        }
      }}
      onKeyUp={resumeHold.cancel}
      onPointerCancel={resumeHold.cancel}
      onPointerDown={resumeHold.start}
      onPointerLeave={resumeHold.cancel}
      onPointerUp={resumeHold.cancel}
      type="button"
    >
      {strings.stop.resume}
      <span aria-hidden="true" style={{ transform: `scaleX(${resumeHold.value})` }} />
    </button>
  );
}

function TourMaintenancePractice({ onComplete, strings }: { onComplete: () => void; strings: RuntimeStrings }) {
  const hold = useHoldGesture(MAINTENANCE_HOLD_MS, onComplete);
  return (
    <button
      aria-label={strings.kiosk.maintenanceAria}
      className="runtime-tour-maintenance"
      onClick={(event) => {
        if (event.detail === 0) {
          onComplete();
        }
      }}
      onKeyDown={(event) => {
        if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
          hold.start();
        }
      }}
      onKeyUp={hold.cancel}
      onPointerCancel={hold.cancel}
      onPointerDown={hold.start}
      onPointerLeave={hold.cancel}
      onPointerUp={hold.cancel}
      type="button"
    >
      <span aria-hidden="true">☰</span>
      <span aria-hidden="true" style={{ transform: `scaleX(${hold.value})` }} />
    </button>
  );
}

type PracticeMovement = { controlName: string; directionLabel: string };

function resolvePracticeMovement(application: ApplicationConfig, strings: RuntimeStrings): PracticeMovement {
  const widget = application.screens
    .flatMap((candidate) => candidate.widgets)
    .find((candidate) => candidate.kind === "joystick");
  const labels = widget?.settings.labels;
  const topLabel = isRecord(labels) && typeof labels.top === "string" ? labels.top : strings.settings.tryForward;
  return { controlName: widget?.title ?? strings.tour.movementFallback, directionLabel: topLabel };
}

function resolveStepBody(
  stepId: RuntimeTourStepId,
  strings: RuntimeStrings,
  applicationName: string,
  screenTitle: string,
  movement: PracticeMovement,
  moveCount: number,
): string {
  if (stepId === "screen") {
    return strings.tour.screenBody(applicationName, screenTitle);
  }
  if (stepId === "move") {
    return strings.tour.moveBody(movement.controlName, movement.directionLabel, moveCount);
  }
  return strings.tour.steps[stepId].body;
}

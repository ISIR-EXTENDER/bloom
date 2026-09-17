import type { RuntimeLanguage } from "@bloom/api-client";

import { useAssistiveActivation } from "./assistive-activation";
import { useRuntimeStrings } from "./strings";
import { useHoldGesture } from "./use-hold-gesture";
import type { RegionRect } from "./use-reserved-region-rect";

const RESUME_HOLD_MS = 1000;
/**
 * The only positive tab index in the runtime: STOP was the second-to-last tab
 * stop on a drive screen, and nothing else may come before it.
 */
const STOP_TAB_INDEX = 1;

export type RuntimeStopControlProps = {
  /** null while unknown; rendered as running so STOP is always pressable. */
  stopped: boolean | null;
  requestError: string;
  onEngage: () => void;
  onResume: () => void;
  language?: RuntimeLanguage;
  resumeDisabled?: boolean;
  resumeDisabledReason?: string;
  /** The screen's reserved `stop` region in the canvas shell; without one STOP floats in the corner. */
  region?: RegionRect | null;
};

/**
 * STOP as runtime chrome (finding 3): tap stops on pointerdown, resuming
 * takes a 1s hold, and the stopped look follows the backend's latch only.
 */
export function RuntimeStopControl({
  stopped,
  requestError,
  onEngage,
  onResume,
  language = "en",
  resumeDisabled = false,
  resumeDisabledReason = "",
  region = null,
}: RuntimeStopControlProps) {
  const placement = region ? "region" : "corner";
  const style = region ? { height: region.height, left: region.left, top: region.top, width: region.width } : undefined;
  const strings = useRuntimeStrings(language);
  const resume = () => {
    if (!resumeDisabled) {
      onResume();
    }
  };
  const resumeHold = useHoldGesture(RESUME_HOLD_MS, resume);
  // A scan or dwell activation already took its time to get here; the pointer
  // hold is unchanged.
  const resumeRef = useAssistiveActivation<HTMLButtonElement>(resume);
  const startResumeHold = () => {
    if (!resumeDisabled) {
      resumeHold.start();
    }
  };

  if (stopped) {
    return (
      <button
        key="resume"
        aria-label={`${strings.stop.resumeAria}${resumeDisabledReason ? `. ${resumeDisabledReason}` : ""}`}
        className="runtime-stop-control"
        data-dwell-action="resume"
        data-dwell-min-ms={RESUME_HOLD_MS}
        data-placement={placement}
        data-runtime-control-independent=""
        data-scan-priority="stop"
        data-stopped="true"
        disabled={resumeDisabled}
        onBlur={resumeHold.cancel}
        onKeyDown={(event) => {
          if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
            startResumeHold();
          }
        }}
        onKeyUp={resumeHold.cancel}
        onPointerCancel={resumeHold.cancel}
        onPointerDown={startResumeHold}
        onPointerLeave={resumeHold.cancel}
        onPointerUp={resumeHold.cancel}
        ref={resumeRef}
        style={style}
        tabIndex={STOP_TAB_INDEX}
        type="button"
      >
        <span className="runtime-stop-label">{strings.stop.resume}</span>
        {requestError || resumeDisabledReason ? (
          <span className="runtime-stop-error">{requestError || resumeDisabledReason}</span>
        ) : null}
        <span aria-hidden="true" className="runtime-stop-hold" style={{ transform: `scaleX(${resumeHold.value})` }} />
      </button>
    );
  }

  return (
    <button
      key="stop"
      aria-label={strings.stop.engageAria}
      className="runtime-stop-control"
      data-placement={placement}
      data-runtime-control-independent=""
      data-scan-priority="stop"
      onClick={(event) => {
        // Keyboard only; a pointer tap already engaged on pointerdown.
        if (event.detail === 0) {
          onEngage();
        }
      }}
      onPointerDown={onEngage}
      style={style}
      tabIndex={STOP_TAB_INDEX}
      type="button"
    >
      <span className="runtime-stop-label">{strings.stop.engage}</span>
      {requestError ? <span className="runtime-stop-error">{requestError}</span> : null}
    </button>
  );
}

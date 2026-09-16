import type { RuntimeLanguage } from "@bloom/api-client";

import { useRuntimeStrings } from "./strings";
import { useHoldGesture } from "./use-hold-gesture";

const RESUME_HOLD_MS = 1000;

export type RuntimeStopControlProps = {
  /** null while unknown; rendered as running so STOP is always pressable. */
  stopped: boolean | null;
  requestError: string;
  onEngage: () => void;
  onResume: () => void;
  language?: RuntimeLanguage;
  resumeDisabled?: boolean;
  resumeDisabledReason?: string;
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
}: RuntimeStopControlProps) {
  const strings = useRuntimeStrings(language);
  const resumeHold = useHoldGesture(RESUME_HOLD_MS, () => {
    if (!resumeDisabled) {
      onResume();
    }
  });
  const startResumeHold = () => {
    if (!resumeDisabled) {
      resumeHold.start();
    }
  };

  if (stopped) {
    return (
      <button
        aria-label={`${strings.stop.resumeAria}${resumeDisabledReason ? `. ${resumeDisabledReason}` : ""}`}
        className="runtime-stop-control"
        data-dwell-action="resume"
        data-dwell-min-ms={RESUME_HOLD_MS}
        data-runtime-control-independent=""
        data-stopped="true"
        disabled={resumeDisabled}
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
      aria-label={strings.stop.engageAria}
      className="runtime-stop-control"
      data-runtime-control-independent=""
      onClick={(event) => {
        // Keyboard only; a pointer tap already engaged on pointerdown.
        if (event.detail === 0) {
          onEngage();
        }
      }}
      onPointerDown={onEngage}
      type="button"
    >
      <span className="runtime-stop-label">{strings.stop.engage}</span>
      {requestError ? <span className="runtime-stop-error">{requestError}</span> : null}
    </button>
  );
}

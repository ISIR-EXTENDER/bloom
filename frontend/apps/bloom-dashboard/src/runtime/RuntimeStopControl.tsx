import { useHoldGesture } from "./use-hold-gesture";

const RESUME_HOLD_MS = 1000;

export type RuntimeStopControlProps = {
  /** null while unknown; rendered as running so STOP is always pressable. */
  stopped: boolean | null;
  requestError: string;
  onEngage: () => void;
  onResume: () => void;
};

/**
 * STOP as runtime chrome (finding 3): tap stops on pointerdown, resuming
 * takes a 1s hold, and the stopped look follows the backend's latch only.
 */
export function RuntimeStopControl({ stopped, requestError, onEngage, onResume }: RuntimeStopControlProps) {
  const resumeHold = useHoldGesture(RESUME_HOLD_MS, onResume);

  if (stopped) {
    return (
      <button
        aria-label="Hold for one second to resume"
        className="runtime-stop-control"
        data-stopped="true"
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
        <span className="runtime-stop-label">HOLD TO RESUME</span>
        {requestError ? <span className="runtime-stop-error">{requestError}</span> : null}
        <span aria-hidden="true" className="runtime-stop-hold" style={{ transform: `scaleX(${resumeHold.value})` }} />
      </button>
    );
  }

  return (
    <button
      aria-label="Stop the robot"
      className="runtime-stop-control"
      onClick={(event) => {
        // Keyboard only; a pointer tap already engaged on pointerdown.
        if (event.detail === 0) {
          onEngage();
        }
      }}
      onPointerDown={onEngage}
      type="button"
    >
      <span className="runtime-stop-label">STOP</span>
      {requestError ? <span className="runtime-stop-error">{requestError}</span> : null}
    </button>
  );
}

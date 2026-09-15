import { useHoldGesture } from "./use-hold-gesture";

const RESUME_HOLD_MS = 1000;

export type RuntimeStopControlProps = {
  /** null while the backend has not answered yet; rendered as running so the
   * control is pressable from the first frame. */
  stopped: boolean | null;
  /** Why the last stop or resume request failed, or empty. Shown inside the
   * control: a STOP that failed silently is worse than no STOP. */
  requestError: string;
  onEngage: () => void;
  onResume: () => void;
};

/**
 * The stop target, as runtime chrome (finding 3).
 *
 * Not a widget: the builder cannot move it, remove it, or cover it, so an
 * operator's hand finds it in the same corner of the glass in every app
 * (finding 12 -- their eyes are on the gripper, not the screen).
 *
 * The asymmetry is deliberate. Stopping is a tap and immediate, on
 * `pointerdown` rather than click so it fires the moment the finger lands.
 * Resuming takes a 1s hold, cancelled by release or leave with progress reset
 * to zero, so motion cannot restart from a brush of the glass -- and a
 * half-finished hold cannot be completed by someone who never started it.
 *
 * The look never flips to "stopped" optimistically: it follows the backend's
 * latch, because this control's appearance is a safety claim.
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
        // Keyboard activation only: a pointer tap already engaged on
        // pointerdown, the moment the finger landed.
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

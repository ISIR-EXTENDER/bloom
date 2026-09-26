import type { RendererStrings } from "./renderer-strings";
import type { LatchCountdown } from "./use-latch-countdown";

/** The last seconds of a latch, with a way to keep it that does not move anything. */
export function LatchCountdownNotice({ countdown, text }: { countdown: LatchCountdown; text: RendererStrings }) {
  if (countdown.secondsLeft === null) {
    return null;
  }
  // An overlay, so the step targets under a resting pointer do not move; the count is for the eyes, and the
  // live region says the warning once rather than every second.
  return (
    <span className="bloom-latch-countdown">
      <span aria-hidden="true">{text.releasesIn(countdown.secondsLeft)}</span>
      <span className="sr-only" role="status">
        {text.releasesSoon}
      </span>
      <button className="bloom-latch-keep" data-scan-urgent="" onClick={countdown.keep} type="button">
        {text.keepGoing}
      </button>
    </span>
  );
}

import type { RendererStrings } from "./renderer-strings";
import type { LatchCountdown } from "./use-latch-countdown";

/** The last seconds of a latch, with a way to keep it that does not move anything. */
export function LatchCountdownNotice({ countdown, text }: { countdown: LatchCountdown; text: RendererStrings }) {
  if (countdown.secondsLeft === null) {
    return null;
  }
  return (
    <span className="bloom-latch-countdown">
      <span role="status">{text.releasesIn(countdown.secondsLeft)}</span>
      <button className="bloom-latch-keep" onClick={countdown.keep} type="button">
        {text.keepGoing}
      </button>
    </span>
  );
}

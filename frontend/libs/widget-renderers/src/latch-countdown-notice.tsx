import type { RendererStrings } from "./renderer-strings";
import type { LatchCountdown } from "./use-latch-countdown";

/** The last seconds of a latch, with a way to keep it that does not move anything. */
export function LatchCountdownNotice({ countdown, text }: { countdown: LatchCountdown; text: RendererStrings }) {
  // The live region is always there and filled on the change: one mounted already holding its words is often
  // not read, and the release itself used to go unsaid.
  const announcement = countdown.secondsLeft !== null ? text.releasesSoon : countdown.released ? text.released : "";
  return (
    <>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {countdown.secondsLeft === null ? null : (
        <span className="bloom-latch-countdown">
          <span aria-hidden="true">{text.releasesIn(countdown.secondsLeft)}</span>
          <button className="bloom-latch-keep" data-scan-urgent="" onClick={countdown.keep} type="button">
            {text.keepGoing}
          </button>
        </span>
      )}
    </>
  );
}

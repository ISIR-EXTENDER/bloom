import type { RuntimeLanguage } from "@bloom/api-client";
import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { useAssistiveActivation } from "./assistive-activation";
import { useRuntimeStrings } from "./strings";
import { useAssistiveConfirm } from "./use-assistive-confirm";
import { useHoldGesture } from "./use-hold-gesture";
import type { RegionRect } from "./use-reserved-region-rect";

const RESUME_HOLD_MS = 1000;
/**
 * The only positive tab index in the runtime: STOP was the second-to-last tab
 * stop on a drive screen, and nothing else may come before it.
 */
const STOP_TAB_INDEX = 1;
const STOP_AGAIN_GAP = 8;

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
  /** Latched but not asserted on ROS: STOP again sits beside Resume so the operator can re-assert. */
  reassert?: boolean;
  /** The latch Resume answers; a new one drops a hold or armed confirm begun on the old. */
  latchId?: string;
  /** Switch scanning: a key is the switch, so Resume only arms and confirms, never takes a key hold. */
  scanMode?: boolean;
};

function isActivationKey(event: KeyboardEvent) {
  return !event.repeat && (event.key === "Enter" || event.key === " ");
}

/**
 * STOP as runtime chrome (finding 3): tap stops on pointerdown, resuming
 * takes a 1s hold. The stopped look follows the backend latch, and a press the backend has not confirmed.
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
  reassert = false,
  latchId = "",
  scanMode = false,
}: RuntimeStopControlProps) {
  const placement = region ? "region" : "corner";
  const style = region ? { height: region.height, left: region.left, top: region.top, width: region.width } : undefined;
  const strings = useRuntimeStrings(language);
  // Set only when a keyboard hold completes: a tap that let go early left it set, and a later resume from another
  // station pulled focus to STOP from wherever the operator was.
  const keyboardHoldRef = useRef(false);
  const keyboardPressRef = useRef(false);
  // A real key went down on STOP. A scan or dwell activation also clicks with detail 0, and handing focus to Resume
  // then put the switch on Resume's own key handler.
  const stopKeyDownRef = useRef(false);
  const resume = () => {
    if (!resumeDisabled) {
      keyboardPressRef.current = keyboardHoldRef.current;
      onResume();
    }
  };
  const resumeHold = useHoldGesture(RESUME_HOLD_MS, resume);
  const assistiveResume = useAssistiveConfirm(resume, resumeDisabled);
  const assistiveArmed = assistiveResume.armed;
  const disarm = assistiveResume.disarm;
  const resumeRef = useAssistiveActivation<HTMLButtonElement>(assistiveResume.activate);
  // STOP and Resume are two elements, so a rest begun on STOP never completes as a resume. The swap dropped a
  // keyboard operator's focus to the page; a keyboard press hands it to the element that replaces it.
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    void stopped;
    if (keyboardPressRef.current) {
      keyboardPressRef.current = false;
      buttonRef.current?.focus();
    }
    // The key comes up on the element that replaced the one it went down on; nothing else would clear it.
    keyboardHoldRef.current = false;
  }, [stopped]);
  // A resume the backend refused leaves STOP engaged: the pending hand-over must not fire on a later resume from
  // another station.
  useEffect(() => {
    if (requestError) {
      keyboardPressRef.current = false;
    }
  }, [requestError]);
  const cancelResumeHold = resumeHold.cancel;
  // A hold or armed confirm belongs to the stop it began on: left running across a resume from elsewhere, it
  // completed after the operator pressed STOP again and resumed the robot.
  useEffect(() => {
    void stopped;
    void latchId;
    cancelResumeHold();
    disarm();
  }, [cancelResumeHold, disarm, latchId, stopped]);
  useEffect(() => {
    if (resumeDisabled) {
      cancelResumeHold();
    }
  }, [cancelResumeHold, resumeDisabled]);
  const startResumeHold = () => {
    if (!resumeDisabled) {
      resumeHold.start();
    }
  };

  const engageButton = (again: boolean, buttonStyle: CSSProperties | undefined) => (
    <button
      key={again ? "stop-again" : "stop"}
      aria-label={
        again
          ? strings.stop.stopAgainAria
          : requestError
            ? `${strings.stop.engageAria}. ${requestError}`
            : strings.stop.engageAria
      }
      className="runtime-stop-control"
      data-dwell-action={again ? "stop-again" : undefined}
      data-placement={placement}
      data-runtime-control-independent=""
      data-scan-priority="stop"
      data-stop-again={again ? "true" : undefined}
      onBlur={() => {
        stopKeyDownRef.current = false;
      }}
      onClick={(event) => {
        // Keyboard, scan and dwell; a pointer tap already engaged on pointerdown.
        if (event.detail === 0) {
          // STOP again stays mounted, so there is no hand-over to make.
          keyboardPressRef.current = !again && stopKeyDownRef.current;
          stopKeyDownRef.current = false;
          onEngage();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        // A key still held from Resume's hold auto-repeats onto STOP once focus is handed over; only a fresh press stops.
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        stopKeyDownRef.current = true;
      }}
      onKeyUp={(event) => {
        // Space clicks on keyup: one that went down on Resume must not click STOP.
        if (event.key === " " && !stopKeyDownRef.current) {
          event.preventDefault();
        }
      }}
      onPointerDown={onEngage}
      ref={again ? undefined : buttonRef}
      style={buttonStyle}
      tabIndex={STOP_TAB_INDEX}
      type="button"
    >
      <span className="runtime-stop-label">{again ? strings.stop.stopAgain : strings.stop.engage}</span>
      {!again && requestError ? <span className="runtime-stop-error">{requestError}</span> : null}
    </button>
  );

  if (stopped) {
    const showStopAgain = reassert;
    const stopAgainHeight = region ? Math.round((region.height - STOP_AGAIN_GAP) * 0.4) : 0;
    const stopAgainStyle = region && showStopAgain ? { ...style, height: stopAgainHeight } : style;
    const resumeStyle =
      region && showStopAgain
        ? {
            ...style,
            height: region.height - STOP_AGAIN_GAP - stopAgainHeight,
            top: region.top + stopAgainHeight + STOP_AGAIN_GAP,
          }
        : style;
    return (
      <>
        {showStopAgain ? engageButton(true, stopAgainStyle) : null}
        <button
          key="resume"
          aria-label={`${assistiveArmed ? strings.stop.resumeConfirmAria : strings.stop.resumeAria}${
            requestError || resumeDisabledReason ? `. ${requestError || resumeDisabledReason}` : ""
          }`}
          className="runtime-stop-control"
          // Armed, it holds the scan highlight so the confirming press lands on it, as an armed Go home does.
          data-armed={assistiveArmed ? "true" : undefined}
          data-dwell-action="resume"
          data-dwell-min-ms={RESUME_HOLD_MS}
          data-placement={placement}
          data-reassert={showStopAgain ? "true" : undefined}
          data-runtime-control-independent=""
          data-scan-priority="stop"
          data-stopped="true"
          disabled={resumeDisabled}
          onBlur={() => {
            keyboardHoldRef.current = false;
            resumeHold.cancel();
          }}
          onKeyDown={(event) => {
            // Under scanning a key is the switch: it arms and confirms through the scan, never a hold here.
            if (scanMode) {
              return;
            }
            if (isActivationKey(event)) {
              keyboardHoldRef.current = true;
              startResumeHold();
            }
          }}
          onKeyUp={() => {
            keyboardHoldRef.current = false;
            resumeHold.cancel();
          }}
          onPointerCancel={resumeHold.cancel}
          onPointerDown={startResumeHold}
          onPointerLeave={resumeHold.cancel}
          onPointerUp={resumeHold.cancel}
          ref={(node) => {
            buttonRef.current = node;
            resumeRef(node);
          }}
          style={resumeStyle}
          tabIndex={STOP_TAB_INDEX}
          type="button"
        >
          <span className="runtime-stop-label">
            {assistiveArmed ? strings.stop.resumeConfirm : strings.stop.resume}
          </span>
          {requestError || resumeDisabledReason ? (
            <span className="runtime-stop-error">{requestError || resumeDisabledReason}</span>
          ) : null}
          <span aria-hidden="true" className="runtime-stop-hold" style={{ transform: `scaleX(${resumeHold.value})` }} />
        </button>
      </>
    );
  }

  return <>{engageButton(false, style)}</>;
}

import { useEffect, useRef, useState } from "react";

import { applyScaledDeadZone, type ComponentContribution, type TwistComponent } from "./teleop-composition";

const POLL_MS = 50;
const CONTRIBUTION_ID = "gamepad";

/** Which gamepad axis drives which twist component, and by how much. */
export type GamepadAxisBinding = {
  axis: number;
  component: TwistComponent;
  scale?: number;
};

export type GamepadState = {
  /** The connected pad's id, or empty when none is attached. */
  id: string;
  connected: boolean;
};

/**
 * Standard-layout sticks: left drives translation, right drives rotation.
 * Y axes are inverted because a pad reports "up" as negative.
 */
export const DEFAULT_GAMEPAD_AXIS_MAP: GamepadAxisBinding[] = [
  { axis: 0, component: "linear_x" },
  { axis: 1, component: "linear_y", scale: -1 },
  { axis: 2, component: "angular_x" },
  { axis: 3, component: "angular_y", scale: -1 },
];

export type GamepadInputOptions = {
  axisMap?: GamepadAxisBinding[];
  deadzone?: number;
  enabled: boolean;
  /** Called with the pad's contribution on every poll while it is active. */
  onContribution: (contribution: ComponentContribution | null) => void;
};

/**
 * A physical gamepad as a first-class input source.
 *
 * The browser's Gamepad API covers the supervisor's joystick and any adaptive
 * controller or switch box that presents as one -- no driver, no native build.
 * The pad feeds the same composed twist as the touch pads, so the adapter
 * boundary never learns a new input existed.
 *
 * Polling is required: the API has no movement events. The poll stops when no
 * pad is connected, and a released pad emits one zero so a stick that springs
 * back cannot leave a standing command.
 */
export function useGamepadInput(options: GamepadInputOptions): GamepadState {
  const [state, setState] = useState<GamepadState>({ connected: false, id: "" });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const wasActiveRef = useRef(false);
  const awaitingNeutralRef = useRef(true);

  useEffect(() => {
    if (!options.enabled || typeof navigator === "undefined" || !navigator.getGamepads) {
      awaitingNeutralRef.current = true;
      return;
    }

    let surfaceActive = document.visibilityState !== "hidden";

    const readPads = () => (navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => pad !== null);

    const releaseContribution = () => {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        optionsRef.current.onContribution(null);
      }
    };

    const syncConnection = () => {
      const [pad] = readPads();
      setState({ connected: pad !== undefined, id: pad?.id ?? "" });
    };

    const suspendInput = () => {
      surfaceActive = false;
      awaitingNeutralRef.current = true;
      releaseContribution();
    };

    const resumeInput = () => {
      surfaceActive = document.visibilityState !== "hidden";
      awaitingNeutralRef.current = true;
    };

    const syncVisibility = () => {
      if (document.visibilityState === "hidden") {
        suspendInput();
      } else {
        resumeInput();
      }
    };

    const poll = () => {
      const current = optionsRef.current;
      const [pad] = readPads();
      if (!pad) {
        awaitingNeutralRef.current = true;
        releaseContribution();
        return;
      }
      if (!surfaceActive) {
        return;
      }

      const axisMap = current.axisMap ?? DEFAULT_GAMEPAD_AXIS_MAP;
      const deadzone = current.deadzone ?? 0.12;
      const contribution: ComponentContribution = {};
      let engaged = false;
      for (const binding of axisMap) {
        const raw = pad.axes[binding.axis];
        if (typeof raw !== "number") {
          continue;
        }
        const conditioned = applyScaledDeadZone(raw, deadzone) * (binding.scale ?? 1);
        if (conditioned !== 0) {
          engaged = true;
        }
        contribution[binding.component] = (contribution[binding.component] ?? 0) + conditioned;
      }

      if (awaitingNeutralRef.current) {
        if (!engaged) {
          awaitingNeutralRef.current = false;
        }
        return;
      }

      // Release sends one explicit zero, then goes quiet.
      if (!engaged && !wasActiveRef.current) {
        return;
      }
      wasActiveRef.current = engaged;
      current.onContribution(engaged ? contribution : null);
    };

    syncConnection();
    window.addEventListener("gamepadconnected", syncConnection);
    window.addEventListener("gamepaddisconnected", syncConnection);
    window.addEventListener("blur", suspendInput);
    window.addEventListener("focus", resumeInput);
    document.addEventListener("visibilitychange", syncVisibility);
    const timer = window.setInterval(poll, POLL_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("gamepadconnected", syncConnection);
      window.removeEventListener("gamepaddisconnected", syncConnection);
      window.removeEventListener("blur", suspendInput);
      window.removeEventListener("focus", resumeInput);
      document.removeEventListener("visibilitychange", syncVisibility);
      awaitingNeutralRef.current = true;
      releaseContribution();
    };
  }, [options.enabled]);

  return state;
}

export const GAMEPAD_CONTRIBUTION_ID = CONTRIBUTION_ID;

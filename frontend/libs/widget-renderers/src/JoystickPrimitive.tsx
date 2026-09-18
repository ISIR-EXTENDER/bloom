import { padGeometry } from "@bloom/widgets";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type JoystickVector = {
  x: number;
  y: number;
};

export type JoystickLabels = {
  bottom: string;
  left: string;
  right: string;
  top: string;
};

export type JoystickPrimitiveProps = {
  /** Knob fill; a token reference such as `var(--bloom-axis-rotation)`. */
  color?: string;
  deadzone: number;
  labels: JoystickLabels;
  onInteractionEnd?: () => void;
  onInteractionStart?: () => void;
  onVectorChange: (value: JoystickVector) => void;
  /** Advancing it returns the pad to rest without emitting. */
  resetSignal?: number;
  /** The pad's edge length; every other number derives from it (pad recipe). */
  size: number;
  title: string;
  zeroOnRelease?: boolean;
};

const DEFAULT_COLOR = "var(--bloom-axis-translation)";

const KEYBOARD_STEP = 0.1;
const KEY_VECTORS: Record<string, JoystickVector> = {
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
};

export function JoystickPrimitive({
  color = DEFAULT_COLOR,
  deadzone,
  labels,
  onInteractionEnd,
  onInteractionStart,
  onVectorChange,
  resetSignal = 0,
  size,
  title,
  zeroOnRelease = true,
}: JoystickPrimitiveProps) {
  const onInteractionEndRef = useRef(onInteractionEnd);
  const onInteractionStartRef = useRef(onInteractionStart);
  const onVectorChangeRef = useRef(onVectorChange);
  const pointerIdRef = useRef<number | null>(null);
  const [vector, setVector] = useState<JoystickVector>({ x: 0, y: 0 });
  const geometry = padGeometry(size, Math.max(0, Math.min(1, deadzone)));

  useEffect(() => {
    onInteractionEndRef.current = onInteractionEnd;
    onInteractionStartRef.current = onInteractionStart;
    onVectorChangeRef.current = onVectorChange;
  }, [onInteractionEnd, onInteractionStart, onVectorChange]);

  const emitVector = useCallback((nextVector: JoystickVector) => {
    setVector(nextVector);
    onVectorChangeRef.current(nextVector);
  }, []);

  useEffect(
    () => () => {
      if (zeroOnRelease) {
        emitVector({ x: 0, y: 0 });
      }
      onInteractionEndRef.current?.();
    },
    [emitVector, zeroOnRelease],
  );

  // A keyboard is also a switch interface: arrows nudge the vector, holding
  // one repeats, releasing every arrow is the release, Escape zeroes.
  const pressedKeysRef = useRef(new Set<string>());
  const vectorRef = useRef(vector);
  vectorRef.current = vector;

  // The widget zeroed the command (a Zero control, the attention expiry, a
  // runtime suspend). The pad follows, or the next arrow resumes from the old
  // position.
  const lastResetSignalRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastResetSignalRef.current) {
      return;
    }
    lastResetSignalRef.current = resetSignal;
    pressedKeysRef.current.clear();
    pointerIdRef.current = null;
    setVector({ x: 0, y: 0 });
  }, [resetSignal]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Home") {
      event.preventDefault();
      pressedKeysRef.current.clear();
      emitVector({ x: 0, y: 0 });
      onInteractionEndRef.current?.();
      return;
    }
    const direction = KEY_VECTORS[event.key];
    if (!direction) {
      return;
    }
    event.preventDefault();
    if (pressedKeysRef.current.size === 0) {
      onInteractionStartRef.current?.();
    }
    pressedKeysRef.current.add(event.key);
    const current = vectorRef.current;
    emitVector(
      clampToUnitDisk({
        x: Number((current.x + direction.x * KEYBOARD_STEP).toFixed(2)),
        y: Number((current.y + direction.y * KEYBOARD_STEP).toFixed(2)),
      }),
    );
  };

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!KEY_VECTORS[event.key]) {
      return;
    }
    pressedKeysRef.current.delete(event.key);
    if (pressedKeysRef.current.size === 0) {
      onInteractionEndRef.current?.();
      if (zeroOnRelease) {
        emitVector({ x: 0, y: 0 });
      }
    }
  };

  const handleBlur = () => {
    if (pressedKeysRef.current.size === 0) {
      return;
    }
    pressedKeysRef.current.clear();
    onInteractionEndRef.current?.();
    if (zeroOnRelease) {
      emitVector({ x: 0, y: 0 });
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onInteractionStartRef.current?.();
    emitVector(readPointerVector(event, event.currentTarget, deadzone));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    emitVector(readPointerVector(event, event.currentTarget, deadzone));
  };

  const endInteraction = (target: HTMLDivElement, pointerId: number, releaseCapture: boolean) => {
    pointerIdRef.current = null;
    // Releasing a capture the element no longer holds throws, which would take
    // the rest of this handler with it and leave the interaction hanging.
    if (releaseCapture && target.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    onInteractionEndRef.current?.();
    if (zeroOnRelease) {
      emitVector({ x: 0, y: 0 });
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    endInteraction(event.currentTarget, event.pointerId, true);
  };

  /**
   * The browser can take the capture away without sending pointerup, which it
   * does when a captured element is moved or re-rendered mid-gesture. That is
   * routine in the builder, where selecting a widget re-renders it.
   *
   * Without this the pad keeps a stale pointer id, never ends the interaction,
   * and on a real robot never sends the zero that stops motion.
   */
  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    endInteraction(event.currentTarget, event.pointerId, false);
  };
  return (
    <div
      aria-label={title}
      className="bloom-joystick"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      role="application"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: role=application is the interactive pad; focus is how the keyboard drives it.
      tabIndex={0}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ["--bloom-pad-top-inset" as string]: `${geometry.topInset}px`,
        ["--bloom-pad-inset" as string]: `${geometry.inset}px`,
        ["--bloom-pad-label-width" as string]: `${geometry.labelWidth}px`,
        ["--bloom-pad-line-height" as string]: `${geometry.lineHeight}px`,
      }}
    >
      <span className="bloom-joystick-label bloom-joystick-label-top">{bindArrowToWord(labels.top)}</span>
      <span className="bloom-joystick-label bloom-joystick-label-bottom">{bindArrowToWord(labels.bottom)}</span>
      <span className="bloom-joystick-label bloom-joystick-label-left">
        <span>{bindArrowToWord(labels.left)}</span>
      </span>
      <span className="bloom-joystick-label bloom-joystick-label-right">
        <span>{bindArrowToWord(labels.right)}</span>
      </span>
      <span
        aria-hidden="true"
        className="bloom-joystick-ring"
        style={{ width: geometry.ring, height: geometry.ring }}
      />
      <span
        aria-hidden="true"
        className="bloom-joystick-deadzone"
        style={{
          width: geometry.deadzone,
          height: geometry.deadzone,
          ["--bloom-joystick-deadzone" as string]: `${deadzone}`,
        }}
      />
      <span
        aria-hidden="true"
        className="bloom-joystick-knob"
        style={{
          width: geometry.knob,
          height: geometry.knob,
          left: `${50 + vector.x * 37}%`,
          top: `${50 - vector.y * 37}%`,
          background: color,
        }}
      />
      <div
        className="bloom-joystick-zone"
        onLostPointerCapture={handleLostPointerCapture}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      />
    </div>
  );
}

const DIRECTION_ARROWS = "▲▼◀▶↶↷";

/** An arrow orphaned onto its own line carries no direction (pad recipe rule 2). */
export function bindArrowToWord(label: string): string {
  const trimmed = label.trim();
  if (DIRECTION_ARROWS.includes(trimmed.charAt(0))) {
    return trimmed.replace(/^(\S)\s+/, "$1\u00a0");
  }
  if (DIRECTION_ARROWS.includes(trimmed.charAt(trimmed.length - 1))) {
    return trimmed.replace(/\s+(\S)$/, "\u00a0$1");
  }
  return trimmed;
}

export function clampToUnitDisk(vector: JoystickVector): JoystickVector {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude <= 1) {
    return vector;
  }
  return { x: Number((vector.x / magnitude).toFixed(2)), y: Number((vector.y / magnitude).toFixed(2)) };
}

function readPointerVector(
  event: Pick<PointerEvent, "clientX" | "clientY"> | Pick<ReactPointerEvent, "clientX" | "clientY">,
  zone: HTMLElement,
  deadzone: number,
): JoystickVector {
  const rect = zone.getBoundingClientRect();
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return normalizeJoystickVector(
    {
      x: (event.clientX - centerX) / radius,
      y: -(event.clientY - centerY) / radius,
    },
    deadzone,
  );
}

export function normalizeJoystickVector(vector: JoystickVector, deadzone: number): JoystickVector {
  const rawMagnitude = Math.hypot(vector.x, vector.y);
  // The pointer area is square, so a corner sits at magnitude √2 while the pad only ever means 1. Compare
  // the dead zone against what the pad can express, and clamp it the way the drawing already does: read
  // raw, a dead zone of 1 drew an inert pad whose corners still published a full-scale command.
  const safeDeadzone = Math.max(0, Math.min(1, deadzone));
  const magnitude = Math.min(rawMagnitude, 1);

  if (magnitude <= safeDeadzone) {
    return { x: 0, y: 0 };
  }

  if (rawMagnitude <= 1) {
    return { x: clamp(vector.x), y: clamp(vector.y) };
  }

  return {
    x: clamp(vector.x / rawMagnitude),
    y: clamp(vector.y / rawMagnitude),
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(-1, value));
}

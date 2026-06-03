import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

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

export type JoystickLabelColors = Partial<Record<keyof JoystickLabels, string>>;

export type JoystickPrimitiveProps = {
  color?: string;
  deadzone: number;
  labels: JoystickLabels;
  labelColors?: JoystickLabelColors;
  onInteractionEnd?: () => void;
  onInteractionStart?: () => void;
  onVectorChange: (value: JoystickVector) => void;
  size: number;
  title: string;
  zeroOnRelease?: boolean;
};

const DEFAULT_COLOR = "#7fa95f";

export function JoystickPrimitive({
  color = DEFAULT_COLOR,
  deadzone,
  labels,
  labelColors = {},
  onInteractionEnd,
  onInteractionStart,
  onVectorChange,
  size,
  title,
  zeroOnRelease = true,
}: JoystickPrimitiveProps) {
  const onInteractionEndRef = useRef(onInteractionEnd);
  const onInteractionStartRef = useRef(onInteractionStart);
  const onVectorChangeRef = useRef(onVectorChange);
  const pointerIdRef = useRef<number | null>(null);
  const [vector, setVector] = useState<JoystickVector>({ x: 0, y: 0 });

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

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    pointerIdRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onInteractionEndRef.current?.();
    if (zeroOnRelease) {
      emitVector({ x: 0, y: 0 });
    }
  };

  return (
    <div
      aria-label={title}
      className="bloom-joystick"
      role="application"
      style={{ ["--bloom-joystick-size" as string]: `${size}px` }}
    >
      <span className="bloom-joystick-label bloom-joystick-label-top" style={{ color: labelColors.top }}>
        {labels.top}
      </span>
      <span className="bloom-joystick-label bloom-joystick-label-right" style={{ color: labelColors.right }}>
        {labels.right}
      </span>
      <span className="bloom-joystick-label bloom-joystick-label-bottom" style={{ color: labelColors.bottom }}>
        {labels.bottom}
      </span>
      <span className="bloom-joystick-label bloom-joystick-label-left" style={{ color: labelColors.left }}>
        {labels.left}
      </span>
      <div
        className="bloom-joystick-deadzone"
        style={{
          ["--bloom-joystick-deadzone" as string]: `${Math.max(0, Math.min(1, deadzone))}`,
        }}
      />
      <div
        aria-hidden="true"
        className="bloom-joystick-knob"
        style={{
          ["--bloom-joystick-knob-x" as string]: `${vector.x * 42}%`,
          ["--bloom-joystick-knob-y" as string]: `${-vector.y * 42}%`,
          background: color,
        }}
      />
      <div
        className="bloom-joystick-zone"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      />
    </div>
  );
}

export function readPointerVector(
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
  const x = clamp(vector.x);
  const y = clamp(vector.y);
  const magnitude = Math.hypot(x, y);

  if (magnitude <= deadzone) {
    return { x: 0, y: 0 };
  }

  return { x, y };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(-1, value));
}

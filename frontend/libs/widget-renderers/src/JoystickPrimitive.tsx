import { useEffect, useRef } from "react";

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
  color?: string;
  deadzone: number;
  labels: JoystickLabels;
  onVectorChange: (value: JoystickVector) => void;
  size: number;
  title: string;
};

type NippleMoveData = {
  vector: {
    x: number;
    y: number;
  };
};

type NippleManager = {
  destroy: () => void;
  on: (event: string, handler: (event: unknown, data: NippleMoveData) => void) => unknown;
};

const DEFAULT_COLOR = "#7fa95f";

export function JoystickPrimitive({
  color = DEFAULT_COLOR,
  deadzone,
  labels,
  onVectorChange,
  size,
  title,
}: JoystickPrimitiveProps) {
  const managerRef = useRef<NippleManager | null>(null);
  const onVectorChangeRef = useRef(onVectorChange);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onVectorChangeRef.current = onVectorChange;
  }, [onVectorChange]);

  useEffect(() => {
    if (!zoneRef.current) {
      return;
    }

    let active = true;

    const setup = async () => {
      const module = await import("nipplejs");
      if (!active || !zoneRef.current) {
        return;
      }

      const zone = zoneRef.current;
      const centerX = Math.round((zone.clientWidth || size) / 2);
      const centerY = Math.round((zone.clientHeight || size) / 2);
      const api = module.default ?? module;

      const manager = api.create({
        color,
        dynamicPage: true,
        mode: "static",
        position: { left: `${centerX}px`, top: `${centerY}px` },
        restJoystick: true,
        restOpacity: 0.8,
        size,
        zone,
      }) as unknown as NippleManager;
      managerRef.current = manager;

      manager.on("move", (_event: unknown, data: NippleMoveData) => {
        onVectorChangeRef.current(normalizeJoystickVector(data.vector, deadzone));
      });

      manager.on("end", () => {
        onVectorChangeRef.current({ x: 0, y: 0 });
      });
    };

    void setup().catch(() => {
      onVectorChangeRef.current({ x: 0, y: 0 });
    });

    return () => {
      active = false;
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [color, deadzone, size]);

  return (
    <div
      aria-label={title}
      className="bloom-joystick"
      role="application"
      style={{ ["--bloom-joystick-size" as string]: `${size}px` }}
    >
      <span className="bloom-joystick-label bloom-joystick-label-top">{labels.top}</span>
      <span className="bloom-joystick-label bloom-joystick-label-right">{labels.right}</span>
      <span className="bloom-joystick-label bloom-joystick-label-bottom">{labels.bottom}</span>
      <span className="bloom-joystick-label bloom-joystick-label-left">{labels.left}</span>
      <div
        className="bloom-joystick-deadzone"
        style={{
          ["--bloom-joystick-deadzone" as string]: `${Math.max(0, Math.min(1, deadzone))}`,
        }}
      />
      <div className="bloom-joystick-zone" ref={zoneRef} style={{ position: "absolute" }} />
    </div>
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

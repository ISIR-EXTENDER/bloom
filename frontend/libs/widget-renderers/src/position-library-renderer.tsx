import { useEffect, useRef, useState } from "react";
import { getBooleanSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

const DELETE_CONFIRM_MS = 4000;

/**
 * Capture, keep, and export named joint poses. Poses live on the backend
 * until restart; dispatching one still requires exporting it into the
 * manager's parameters, and the copy says so rather than implying otherwise.
 */
export function PositionLibraryWidget({ descriptor, data, onActionIntent }: WidgetRendererProps) {
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const snapshot = data?.type === "position-library" ? data : undefined;
  const joints = snapshot?.joints;
  const saved = snapshot?.saved ?? [];
  const busy = snapshot?.busy === true;
  const [armedDelete, setArmedDelete] = useState("");
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
      }
    },
    [],
  );

  const emit = (intent: Parameters<NonNullable<typeof onActionIntent>>[0]) => {
    onActionIntent?.(intent);
  };

  const handleCapture = () => {
    if (!joints) {
      return;
    }
    emit({
      type: "position-op",
      op: "capture",
      widgetId: descriptor.widget.id,
      widgetKind: descriptor.widget.kind,
      jointNames: [...joints.names],
      positions: [...joints.positions],
    });
  };

  const handleDelete = (name: string) => {
    if (armedDelete !== name) {
      setArmedDelete(name);
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
      }
      disarmTimer.current = setTimeout(() => setArmedDelete(""), DELETE_CONFIRM_MS);
      return;
    }
    setArmedDelete("");
    emit({
      type: "position-op",
      op: "delete",
      widgetId: descriptor.widget.id,
      widgetKind: descriptor.widget.kind,
      name,
    });
  };

  return (
    <div className="bloom-position-library" data-show-details={showDetails ? "true" : "false"}>
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>
          {saved.length} saved · {joints ? `${joints.names.length} joints live` : "waiting for joint states"}
        </span>
      </header>

      <button
        aria-label="Capture the robot's current pose"
        className="bloom-position-capture"
        disabled={busy || !joints}
        onClick={handleCapture}
        type="button"
      >
        Capture pose
      </button>

      {saved.length === 0 ? (
        <p className="bloom-position-empty">No saved poses yet. Capture one while the robot holds the pose you want.</p>
      ) : (
        <ul aria-label="Saved poses" className="bloom-position-list">
          {saved.map((pose) => (
            <li key={pose.name}>
              <span className="bloom-position-name">{pose.name}</span>
              <span className="bloom-position-meta">{pose.jointNames.length} joints</span>
              <button
                aria-label={
                  armedDelete === pose.name ? `Confirm deleting ${pose.name}` : `Delete saved pose ${pose.name}`
                }
                className="bloom-position-delete"
                data-armed={armedDelete === pose.name ? "true" : "false"}
                disabled={busy}
                onClick={() => handleDelete(pose.name)}
                type="button"
              >
                {armedDelete === pose.name ? "Delete?" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="bloom-position-footer">
        <button
          aria-label="Export saved poses as manager parameters"
          className="bloom-position-export"
          disabled={busy || saved.length === 0}
          onClick={() =>
            emit({
              type: "position-op",
              op: "export",
              widgetId: descriptor.widget.id,
              widgetKind: descriptor.widget.kind,
            })
          }
          type="button"
        >
          Export YAML
        </button>
        <p className="bloom-position-note">
          Poses stay on this backend until it restarts. To dispatch one, paste the export into the manager&apos;s
          joint-target parameters.
        </p>
      </div>

      {snapshot?.exportYaml ? (
        <pre aria-label="Manager joint-target parameters" className="bloom-position-yaml">
          {snapshot.exportYaml}
        </pre>
      ) : null}

      <p aria-live="polite" className="bloom-position-notice" role="status">
        {snapshot?.notice ?? ""}
      </p>
    </div>
  );
}

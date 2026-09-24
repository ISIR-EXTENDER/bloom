import { getBooleanSetting, getStringSetting, hidesTitle } from "@bloom/widgets";
import { lazy, Suspense, useState } from "react";
import { isMoving } from "./robot-3d-command";
import type { WidgetRendererProps } from "./types";

const RobotScene = lazy(() => import("./robot-3d-scene"));

import type { SceneStatus } from "./robot-3d-scene";

/** The running robot from its own description, its joints from ROS, and markers as rviz reads them. */
export function Robot3dWidget({ data, descriptor, robotModel }: WidgetRendererProps) {
  const settings = descriptor.widget.settings;
  const jointStateTopic = getStringSetting(settings, "jointStateTopic", "/joint_states");
  const markerTopic = getStringSetting(settings, "markerTopic", "");
  const eeLink = getStringSetting(settings, "eeLink", "");
  const showAxes = getBooleanSetting(settings, "showAxes", true);
  const frameAxes = getBooleanSetting(settings, "frameAxes", false);
  const [status, setStatus] = useState<SceneStatus>({
    joints: { driven: 0, total: 0 },
    links: 0,
    loading: 0,
    markers: 0,
    meshes: 0,
    model: "loading",
    pose: false,
    target: false,
    unplaced: 0,
    updates: 0,
  });
  const [fitRequest, setFitRequest] = useState(0);
  const snapshot = data?.type === "robot-3d" ? data : undefined;
  const command = snapshot?.command;
  const moving = isMoving(command);
  const desktop = descriptor.context.deviceClass !== "tablet";
  const canDraw = desktop && typeof window !== "undefined" && "WebGLRenderingContext" in window && Boolean(robotModel);
  const note = !desktop
    ? "Desktop screens only."
    : !robotModel
      ? "No robot model source in this runtime."
      : !canDraw
        ? "This browser cannot draw 3D."
        : status.model === "unavailable"
          ? "No robot description from the API yet. Launch the robot; the view keeps asking."
          : null;

  return (
    <div className="bloom-robot-3d-widget">
      {hidesTitle(settings) ? null : (
        <header className="bloom-display-header">
          <strong>{descriptor.widget.title}</strong>
          <span>{jointStateTopic}</span>
        </header>
      )}
      <div
        aria-label={`${descriptor.widget.title} 3D view`}
        className="bloom-robot-3d-stage"
        data-command={moving ? "moving" : "still"}
        data-links={status.links}
        data-markers={status.markers}
        data-markers-loading={status.loading}
        data-markers-unplaced={status.unplaced}
        data-joints={`${status.joints.driven}/${status.joints.total}`}
        data-joint-updates={status.updates}
        data-pose={status.pose ? "shown" : "none"}
        data-target={status.target ? "shown" : "none"}
        data-mesh-error={status.meshError}
        data-meshes={status.meshes}
        data-model={canDraw && robotModel ? status.model : "unavailable"}
        role="img"
      >
        {canDraw && robotModel ? (
          <Suspense fallback={<p className="bloom-robot-3d-note">Loading the 3D view.</p>}>
            <RobotScene
              eeLink={eeLink}
              command={moving ? command : undefined}
              fitRequest={fitRequest}
              frameAxes={frameAxes}
              jointState={asJointState(snapshot?.value)}
              markers={asMarkers(snapshot?.markers)}
              onStatus={setStatus}
              pose={asPose(snapshot?.pose)}
              robotModel={robotModel}
              showAxes={showAxes}
              target={asJointState(snapshot?.target)}
            />
          </Suspense>
        ) : null}
        {canDraw && robotModel && status.model === "ready" ? (
          <button
            aria-label="Frame the robot"
            className="bloom-robot-3d-fit"
            onClick={() => setFitRequest((count) => count + 1)}
            type="button"
          >
            Frame
          </button>
        ) : null}
        {note ? <p className="bloom-robot-3d-note">{note}</p> : null}
      </div>
      <strong className="bloom-display-source">
        {snapshot ? summarizeJointState(snapshot.value, status.joints) : "Waiting for joint states"}
        {markerTopic ? ` · markers ${markerTopic}` : ""}
      </strong>
    </div>
  );
}

function asJointState(value: unknown): { name?: unknown; position?: unknown } | undefined {
  return typeof value === "object" && value !== null ? (value as { name?: unknown; position?: unknown }) : undefined;
}

function asPose(value: unknown): { header?: unknown; pose?: unknown } | undefined {
  return typeof value === "object" && value !== null ? (value as { header?: unknown; pose?: unknown }) : undefined;
}

function asMarkers(value: unknown): readonly Record<string, unknown>[] | undefined {
  const markers = typeof value === "object" && value !== null ? (value as { markers?: unknown }).markers : undefined;
  return Array.isArray(markers) ? (markers as Record<string, unknown>[]) : undefined;
}

export function summarizeJointState(value: unknown, joints?: { driven: number; total: number }): string {
  const state = asJointState(value);
  const names = Array.isArray(state?.name) ? state.name : [];
  const positions = Array.isArray(state?.position) ? state.position : [];
  if (names.length === 0 && positions.length === 0) {
    return "Live joint state received";
  }
  const count = Math.max(names.length, positions.length);
  const live = count === 1 ? "1 live joint" : `${count} live joints`;
  // A real arm may publish fewer joints than the description declares; say so rather than draw silently.
  if (joints && joints.total > 0 && joints.driven < joints.total) {
    return `${live}, ${joints.driven} of the model's ${joints.total} driven`;
  }
  return live;
}

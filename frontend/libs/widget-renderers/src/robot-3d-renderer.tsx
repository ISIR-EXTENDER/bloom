import { getBooleanSetting, getStringSetting, hidesTitle, isRecord } from "@bloom/widgets";
import { lazy, Suspense, useEffect, useState } from "react";
import { useBehaviourReported, useOtherBehaviourKnown } from "./behaviour-feedback";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import { isMoving } from "./robot-3d-command";
import type { SceneStatus } from "./robot-3d-scene";
import type { WidgetRendererProps } from "./types";
import { localReceivedAt } from "./use-now";

const RobotScene = lazy(() => import("./robot-3d-scene"));

/** The running robot from its own description, its joints from ROS, and markers as rviz reads them. */
export function Robot3dWidget({ data, descriptor, language, robotModel }: WidgetRendererProps) {
  const text = rendererStrings(language);
  const settings = descriptor.widget.settings;
  const jointStateTopic = getStringSetting(settings, "jointStateTopic", "/joint_states");
  const markerTopic = getStringSetting(settings, "markerTopic", "");
  const eeLink = getStringSetting(settings, "eeLink", "");
  const softGoalTopic = getStringSetting(settings, "softGoalTopic", "");
  const goalsTopic = getStringSetting(settings, "goalsTopic", "");
  const showAxes = getBooleanSetting(settings, "showAxes", true);
  const frameAxes = getBooleanSetting(settings, "frameAxes", false);
  const [status, setStatus] = useState<SceneStatus>({
    goals: 0,
    goalsIgnored: 0,
    joints: { driven: 0, total: 0 },
    links: 0,
    loading: 0,
    markers: 0,
    meshes: 0,
    model: "loading",
    pose: false,
    softGoal: false,
    target: false,
    unplaced: 0,
    updates: 0,
  });
  const [fitRequest, setFitRequest] = useState(0);
  const [gestureHint, setGestureHint] = useState(() => !readGestureHintSeen());
  const dismissGestureHint = () => {
    if (!gestureHint) return;
    setGestureHint(false);
    rememberGestureHintSeen();
  };
  const snapshot = data?.type === "robot-3d" ? data : undefined;
  const staleSeconds = useStaleSeconds(localReceivedAt(snapshot?.receivedAt));
  // Shared control ended, or its soft goal stopped: neither the goals nor the soft goal may stay drawn as live.
  const assistReported = useBehaviourReported(softGoalTopic || goalsTopic);
  const otherBehaviour = useOtherBehaviourKnown();
  const assistOff = assistReported === false || otherBehaviour;
  const softGoalStale = useStaleSeconds(localReceivedAt(snapshot?.softGoalReceivedAt)) !== null;
  const gone = assistOff || softGoalStale;
  const goals = gone ? undefined : asSample<{ header?: unknown; poses?: unknown }>(snapshot?.goals);
  const softGoal = gone ? undefined : asSample<{ header?: unknown; pose?: unknown }>(snapshot?.softGoal);
  const command = snapshot?.command;
  const moving = isMoving(command);
  const desktop = descriptor.context.deviceClass !== "tablet";
  const canDraw = desktop && typeof window !== "undefined" && "WebGLRenderingContext" in window && Boolean(robotModel);
  const note = !desktop
    ? text.desktopOnly
    : !robotModel
      ? text.noRobotModel
      : !canDraw
        ? text.cannotDraw3d
        : status.model === "unavailable"
          ? text.noRobotDescription
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
        aria-label={text.view3d(descriptor.widget.title)}
        className="bloom-robot-3d-stage"
        data-command={moving ? "moving" : "still"}
        data-stale={staleSeconds ?? "false"}
        data-links={status.links}
        data-markers={status.markers}
        data-markers-loading={status.loading}
        data-markers-unplaced={status.unplaced}
        data-joints={`${status.joints.driven}/${status.joints.total}`}
        data-joint-updates={status.updates}
        data-pose={status.pose ? "shown" : "none"}
        data-goals={status.goals}
        data-goals-ignored={status.goalsIgnored}
        data-soft-goal={status.softGoal ? "shown" : "none"}
        data-target={status.target ? "shown" : "none"}
        data-mesh-error={status.meshError}
        data-meshes={status.meshes}
        data-model={canDraw && robotModel ? status.model : "unavailable"}
        onPointerDown={dismissGestureHint}
        onWheel={dismissGestureHint}
        role="img"
      >
        {canDraw && robotModel ? (
          <Suspense fallback={<p className="bloom-robot-3d-note">{text.loading3d}</p>}>
            <RobotScene
              eeLink={eeLink}
              command={moving ? command : undefined}
              fitRequest={fitRequest}
              frameAxes={frameAxes}
              jointState={asSample<{ name?: unknown; position?: unknown }>(snapshot?.value)}
              markers={asMarkers(snapshot?.markers)}
              onStatus={setStatus}
              goals={goals}
              pose={asSample<{ header?: unknown; pose?: unknown }>(snapshot?.pose)}
              robotModel={robotModel}
              showAxes={showAxes}
              softGoal={softGoal}
              target={asSample<{ name?: unknown; position?: unknown }>(snapshot?.target)}
            />
          </Suspense>
        ) : null}
        {note ? <p className="bloom-robot-3d-note">{note}</p> : null}
        {!note && staleSeconds !== null ? (
          <>
            {/* The count ticks every second; the live region says the change once. */}
            <p aria-hidden="true" className="bloom-robot-3d-note bloom-robot-3d-stale">
              {text.jointsStale(staleSeconds)}
            </p>
            <span className="sr-only" role="status">
              {text.jointsStalled}
            </span>
          </>
        ) : null}
      </div>
      {gestureHint && canDraw && robotModel && status.model === "ready" ? (
        <p className="bloom-robot-3d-gesture-hint">{text.gestureHint}</p>
      ) : null}
      {canDraw && robotModel && status.model === "ready" ? (
        <button
          aria-label={text.frameRobot}
          className="bloom-robot-3d-fit"
          onClick={() => setFitRequest((count) => count + 1)}
          type="button"
        >
          {text.frame}
        </button>
      ) : null}
      <strong className="bloom-display-source">
        {snapshot ? summarizeJointState(snapshot.value, status.joints, text) : text.waitingJointStates}
        {markerTopic ? ` · ${text.markersFrom(markerTopic)}` : ""}
      </strong>
    </div>
  );
}

// Shown until the first drag or wheel on this device; storage may be blocked, so it fails open.
const GESTURE_HINT_KEY = "bloom.robot3d.gestureHintSeen";

function readGestureHintSeen(): boolean {
  try {
    return window.localStorage.getItem(GESTURE_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberGestureHintSeen() {
  try {
    window.localStorage.setItem(GESTURE_HINT_KEY, "1");
  } catch {
    // The hint then comes back on the next load, which is harmless.
  }
}

/** How long since the joint state last arrived, once that is longer than a robot goes quiet for; null while fresh. */
const STALE_AFTER_MS = 3000;

/** `at` is on this tablet's clock: the backend's stamp would read a skewed tablet's fresh data as stale. */
function useStaleSeconds(at: number | undefined): number | null {
  const [stale, setStale] = useState<number | null>(null);
  useEffect(() => {
    if (at === undefined) {
      setStale(null);
      return;
    }
    const check = () => {
      const age = Date.now() - at;
      setStale(age >= STALE_AFTER_MS ? Math.round(age / 1000) : null);
    };
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [at]);
  return stale;
}

/** A message as the socket hands it over, or undefined for anything that is not an object. */
function asSample<T extends object>(value: unknown): T | undefined {
  return isRecord(value) ? (value as T) : undefined;
}

function asMarkers(value: unknown): readonly Record<string, unknown>[] | undefined {
  const markers = typeof value === "object" && value !== null ? (value as { markers?: unknown }).markers : undefined;
  return Array.isArray(markers) ? (markers as Record<string, unknown>[]) : undefined;
}

export function summarizeJointState(
  value: unknown,
  joints?: { driven: number; total: number },
  text: RendererStrings = rendererStrings(undefined),
): string {
  const state = asSample<{ name?: unknown; position?: unknown }>(value);
  const names = Array.isArray(state?.name) ? state.name : [];
  const positions = Array.isArray(state?.position) ? state.position : [];
  if (names.length === 0 && positions.length === 0) {
    return text.jointStateReceived;
  }
  const live = text.liveJoints(Math.max(names.length, positions.length));
  // A real arm may publish fewer joints than the description declares; say so rather than draw silently.
  if (joints && joints.total > 0 && joints.driven < joints.total) {
    return text.jointsDriven(live, joints.driven, joints.total);
  }
  return live;
}

/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import {
  getDefaultWidgetSettings,
  MOTION_PROFILES,
  MOTION_WATCH_WIDGET_ID,
  motionWatchWidgetId,
  withMotionCheckRobot,
  withMotionWatch,
} from "@bloom/widgets";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeKioskBar } from "./RuntimeKioskBar";
import { appendRuntimeTopicSample, createRuntimeTopicSubscriptionRequests } from "./runtime-topic-data";
import { MOTION_CUE_MS, useMotionCue } from "./use-motion-cue";

const panel: ScreenConfig = {
  id: "command-motion",
  title: "Command vs motion",
  canvas: { preset_id: "full-hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "motion",
      kind: "motion-check",
      title: "Command vs motion",
      layout: { x: 14, y: 130, width: 1460, height: 892 },
      settings: getDefaultWidgetSettings("motion-check"),
    },
  ],
};
const operator: ScreenConfig = { ...panel, id: "drive", title: "Drive", widgets: [] };

const sample = (topic: string, value: unknown, at: number) =>
  ({ payload: { received_at: new Date(at).toISOString(), topic, value }, type: "topic_sample" }) as never;
const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };
const pose = (x: number, y: number, z: number) => ({ orientation: IDENTITY, position: { x, y, z } });
const twist = (y: number) => ({ twist: { angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y, z: 0 } } });

function replay(screenConfig: ScreenConfig, samples: unknown[]): Record<string, WidgetDataSnapshot> {
  return samples.reduce<Record<string, WidgetDataSnapshot>>(
    (data, next) => appendRuntimeTopicSample(data, screenConfig, next as never),
    {},
  );
}

/** Kinova Forward with the tip going the other way: a WRONG WAY verdict. */
function wrongWay(at = 0) {
  return [
    sample("/ee_pose", { pose: pose(0.4, 0, 0.3) }, at),
    sample("/tf", pose(0.4, 0, 0.3), at),
    sample("/joystick_cartesian_command", twist(1), at + 100),
    sample("/ee_pose", { pose: pose(0.4, 0.06, 0.3) }, at + 900),
    sample("/tf", pose(0.4, -0.04, 0.3), at + 900),
    sample("/joystick_cartesian_command", twist(0), at + 950),
    sample("/joint_states", { name: ["joint_1"], position: [0] }, at + 2000),
  ];
}

describe("a Command vs motion panel's subscriptions", () => {
  it("asks for the wire, the commanded hand, the tip through TF, the joints, their command and the gripper", () => {
    const requests = createRuntimeTopicSubscriptionRequests(panel);
    expect(requests.map((request) => [request.topic, request.message_type, request.field_path])).toEqual([
      ["/joystick_cartesian_command", "geometry_msgs/msg/TwistStamped", ""],
      ["/ee_pose", "geometry_msgs/msg/PoseStamped", ""],
      ["/tf", "tf2_msgs/msg/TFMessage", "tip_pose"],
      ["/joint_states", "sensor_msgs/msg/JointState", ""],
      ["/qontrol_controller/commands", "std_msgs/msg/Float64MultiArray", ""],
      ["/gripper_controller/commands", "std_msgs/msg/Float64MultiArray", ""],
    ]);
  });

  it("steps every stream into the panel's verdicts", () => {
    const data = replay(withMotionCheckRobot(panel, "kinova_gen3"), wrongWay());
    const snapshot = data.motion;
    expect(snapshot?.type).toBe("motion-check");
    if (snapshot?.type !== "motion-check") return;
    expect(snapshot.state.robot).toBe("kinova");
    expect(snapshot.state.log[0]).toMatchObject({ chip: "wrong-way", kind: "drive", word: "Forward" });
  });

  it("judges by the robot this Bloom drives unless the panel names one", () => {
    expect(withMotionCheckRobot(panel, "explorer_sim").widgets[0]?.settings.robot).toBe("explorer");
    const pinned = { ...panel, widgets: [{ ...panel.widgets[0], settings: { robot: "kinova" } }] } as ScreenConfig;
    expect(withMotionCheckRobot(pinned, "explorer_sim")).toBe(pinned);
    expect(withMotionCheckRobot(panel, null)).toBe(panel);
  });
});

describe("the operator's motion warnings", () => {
  afterEach(cleanup);

  it("add a hidden panel to the data screen only while on, and only where the screen has none", () => {
    expect(withMotionWatch(operator, false, "kinova")).toBe(operator);
    const watched = withMotionWatch(operator, true, "kinova");
    expect(watched.widgets.map((widget) => [widget.id, widget.settings.robot])).toEqual([
      [MOTION_WATCH_WIDGET_ID, "kinova"],
    ]);
    expect(motionWatchWidgetId(watched)).toBe(MOTION_WATCH_WIDGET_ID);
    expect(withMotionWatch(panel, true, "kinova")).toBe(panel);
    expect(motionWatchWidgetId(panel)).toBe("motion");
  });

  it("raise a cue for a new WRONG WAY verdict, which leaves when dismissed or after a while", () => {
    vi.useFakeTimers();
    const watched = withMotionWatch(operator, true, "kinova");
    const before = replay(watched, [sample("/joint_states", { name: ["joint_1"], position: [0] }, 0)]);
    const after = replay(watched, [sample("/joint_states", { name: ["joint_1"], position: [0] }, 0), ...wrongWay(10)]);
    const { result, rerender } = renderHook(({ snapshot }) => useMotionCue(snapshot, true), {
      initialProps: { snapshot: before[MOTION_WATCH_WIDGET_ID] },
    });
    expect(result.current).toBeNull();
    rerender({ snapshot: after[MOTION_WATCH_WIDGET_ID] });
    expect(result.current?.kind).toBe("handWrongWay");
    act(() => result.current?.dismiss());
    expect(result.current).toBeNull();

    const again = replay(watched, [
      sample("/joint_states", { name: ["joint_1"], position: [0] }, 0),
      ...wrongWay(10),
      ...wrongWay(5000),
    ]);
    rerender({ snapshot: again[MOTION_WATCH_WIDGET_ID] });
    expect(result.current?.kind).toBe("handWrongWay");
    act(() => vi.advanceTimersByTime(MOTION_CUE_MS));
    expect(result.current).toBeNull();
    vi.useRealTimers();
  });

  it("stay silent while off, and for a gripper that moved as asked", () => {
    const finger = MOTION_PROFILES.kinova.finger;
    const watched = withMotionWatch(operator, true, "kinova");
    const start = replay(watched, [sample("/joint_states", { name: [finger], position: [0] }, 0)]);
    const moved = replay(watched, [
      sample("/joint_states", { name: [finger], position: [0] }, 0),
      sample("/gripper_controller/commands", { data: [0.8] }, 100),
      sample("/joint_states", { name: [finger], position: [0.8] }, 600),
    ]);
    const { result, rerender } = renderHook(({ snapshot, on }) => useMotionCue(snapshot, on), {
      initialProps: { on: true, snapshot: start[MOTION_WATCH_WIDGET_ID] },
    });
    rerender({ on: true, snapshot: moved[MOTION_WATCH_WIDGET_ID] });
    expect(result.current).toBeNull();
    const off = renderHook(() => useMotionCue(replay(watched, wrongWay())[MOTION_WATCH_WIDGET_ID], false));
    expect(off.result.current).toBeNull();
  });

  it.each([
    ["en", "Gripper did not move", "Dismiss the motion warning"],
    ["es", "La pinza no se movió", "Descartar el aviso de movimiento"],
    ["fr", "La pince n'a pas bougé", "Fermer l'alerte de mouvement"],
  ] as const)(
    "show in the bar in %s, as a status beside STOP's way, never in the scan cycle",
    (language, word, dismiss) => {
      const onDismiss = vi.fn();
      const application = {
        id: "app",
        name: "Explorer Manager",
        profiles: [],
        screens: [operator],
      } as unknown as ApplicationConfig;
      render(
        <RuntimeKioskBar
          application={application}
          commandFrameId={null}
          language={language}
          motionCue={{ kind: "gripperStill", onDismiss }}
          onEditApplication={vi.fn()}
          onEditScreen={vi.fn()}
          onLanguageChange={vi.fn()}
          onOpenAppLibrary={vi.fn()}
          onOpenHelp={vi.fn()}
          onOpenLanding={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenSupervisor={vi.fn()}
          onOpenTour={vi.fn()}
          onSelectScreen={vi.fn()}
          onSuspendTeleop={vi.fn()}
          profile={{ id: "operator", layoutId: "drive", name: "Operator" }}
          screen={operator}
        />,
      );
      const cue = screen.getAllByRole("status").find((element) => element.textContent?.includes(word));
      expect(cue).toBeDefined();
      const button = screen.getByRole("button", { name: dismiss });
      expect(button.hasAttribute("data-scan-touch-only")).toBe(true);
      fireEvent.click(button);
      expect(onDismiss).toHaveBeenCalledOnce();
    },
  );
});

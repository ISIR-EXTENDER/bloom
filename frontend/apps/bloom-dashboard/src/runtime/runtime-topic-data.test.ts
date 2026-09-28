import type { ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { resolvePackageAsset } from "./robot-model-source";
import {
  appendRuntimeTopicSample,
  createRuntimeTopicSubscriptionRequests,
  withRobotCommand,
} from "./runtime-topic-data";

const screen: ScreenConfig = {
  id: "robot",
  title: "Robot",
  canvas: { preset_id: "hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "view",
      kind: "robot-3d",
      title: "Robot",
      layout: { x: 0, y: 0, width: 546, height: 420 },
      settings: {
        jointStateTopic: "/joint_states",
        markerTopic: "/goal_markers",
        poseTopic: "/ee_pose",
        showAxes: true,
        targetJointTopic: "/joint_target_command",
      },
    },
  ],
};

describe("a 3D robot view's subscriptions", () => {
  it("asks for the joint states, the marker array, the joint target and the pose", () => {
    const requests = createRuntimeTopicSubscriptionRequests(screen);
    expect(requests.map((request) => [request.topic, request.message_type])).toEqual([
      ["/joint_states", "sensor_msgs/msg/JointState"],
      ["/goal_markers", "visualization_msgs/msg/MarkerArray"],
      ["/joint_target_command", "sensor_msgs/msg/JointState"],
      ["/ee_pose", "geometry_msgs/msg/PoseStamped"],
    ]);
  });

  it("asks for nothing extra when the view names no extra topic", () => {
    const bare: ScreenConfig = {
      ...screen,
      widgets: [{ ...screen.widgets[0], settings: { jointStateTopic: "/joint_states", showAxes: true } } as never],
    };
    expect(createRuntimeTopicSubscriptionRequests(bare).map((request) => request.topic)).toEqual(["/joint_states"]);
  });

  it("keeps the newest of each beside the other", () => {
    const joints = { name: ["j1"], position: [0.5] };
    const markers = { markers: [{ ns: "goal", id: 1, type: 2, action: 0 }] };
    const afterJoints = appendRuntimeTopicSample({}, screen, {
      type: "topic_sample",
      payload: { received_at: "t1", topic: "/joint_states", value: joints, widget_id: "view" },
    } as never);
    const afterMarkers = appendRuntimeTopicSample(afterJoints, screen, {
      type: "topic_sample",
      payload: { received_at: "t2", topic: "/goal_markers", value: markers, widget_id: "view" },
    } as never);
    const snapshot = afterMarkers.view;
    expect(snapshot?.type).toBe("robot-3d");
    if (snapshot?.type !== "robot-3d") {
      throw new Error("not a robot-3d snapshot");
    }
    expect(snapshot.value).toEqual(joints);
    expect(snapshot.markers).toEqual(markers);
    expect(snapshot.topic).toBe("/joint_states");
    const target = { name: ["j1"], position: [1.5] };
    const pose = { header: { frame_id: "base_link" }, pose: { position: { x: 0.3, y: 0, z: 0.5 } } };
    const afterTarget = appendRuntimeTopicSample(afterMarkers, screen, {
      type: "topic_sample",
      payload: { received_at: "t3", topic: "/joint_target_command", value: target, widget_id: "view" },
    } as never);
    const afterPose = appendRuntimeTopicSample(afterTarget, screen, {
      type: "topic_sample",
      payload: { received_at: "t4", topic: "/ee_pose", value: pose, widget_id: "view" },
    } as never);
    const full = afterPose.view;
    if (full?.type !== "robot-3d") {
      throw new Error("not a robot-3d snapshot");
    }
    expect(full).toMatchObject({ value: joints, markers, target, pose, receivedAt: "t1" });
    // A new joint state keeps everything else.
    const later = appendRuntimeTopicSample(afterPose, screen, {
      type: "topic_sample",
      payload: {
        received_at: "t5",
        topic: "/joint_states",
        value: { name: ["j1"], position: [0.6] },
        widget_id: "view",
      },
    } as never).view;
    expect(later).toMatchObject({ target, pose, markers, receivedAt: "t5" });
  });
});

describe("a mesh's package and path", () => {
  it("come from a package URI or from the absolute share path xacro writes", () => {
    expect(resolvePackageAsset("package://explorer_description/meshes/visual/base.dae")).toEqual({
      packageName: "explorer_description",
      path: "meshes/visual/base.dae",
    });
    expect(
      resolvePackageAsset(
        "file:///home/lab/ws/install/explorer_description/share/explorer_description/meshes/visual/base.dae",
      ),
    ).toEqual({ packageName: "explorer_description", path: "meshes/visual/base.dae" });
    expect(resolvePackageAsset("/opt/ros/jazzy/share/kortex_description/arms/gen3/7dof/meshes/base_link.STL")).toEqual({
      packageName: "kortex_description",
      path: "arms/gen3/7dof/meshes/base_link.STL",
    });
    expect(resolvePackageAsset("https://example.org/model.dae")).toBeNull();
  });
});

describe("the commanded twist on a 3D robot view", () => {
  it("rides beside the joint states and leaves when the runtime stops driving", () => {
    const joints = { name: ["j1"], position: [0.5] };
    const withJoints = appendRuntimeTopicSample({}, screen, {
      type: "topic_sample",
      payload: { received_at: "t1", topic: "/joint_states", value: joints, widget_id: "view" },
    } as never);
    const driving = withRobotCommand(withJoints, screen, {
      angular: { x: 0, y: 0, z: 0 },
      frame_id: "base_link",
      linear: { x: 0, y: 1, z: 0 },
    });
    const snapshot = driving.view;
    if (snapshot?.type !== "robot-3d") {
      throw new Error("not a robot-3d snapshot");
    }
    expect(snapshot.value).toEqual(joints);
    expect(snapshot.command).toEqual({
      angular: { x: 0, y: 0, z: 0 },
      frameId: "base_link",
      linear: { x: 0, y: 1, z: 0 },
    });

    const stopped = withRobotCommand(driving, screen, null).view;
    expect(stopped?.type === "robot-3d" && stopped.command).toBeUndefined();
  });

  it("gives a view with no joint states yet a snapshot to carry the command", () => {
    const only = withRobotCommand({}, screen, { angular: { x: 0, y: 0, z: 0 }, linear: { x: 1, y: 0, z: 0 } }).view;
    expect(only?.type).toBe("robot-3d");
    expect(only?.type === "robot-3d" && only.command?.linear.x).toBe(1);
  });
});

describe("the screen's topic index", () => {
  const busy: ScreenConfig = {
    ...screen,
    widgets: [
      screen.widgets[0] as never,
      {
        id: "gauge",
        kind: "gauge",
        title: "Height",
        layout: { x: 0, y: 0, width: 200, height: 200 },
        settings: { topic: "/height", messageType: "std_msgs/msg/Float64", fieldPath: "data", min: 0, max: 1 },
      },
      {
        id: "board",
        kind: "plot-board",
        title: "Board",
        layout: { x: 0, y: 0, width: 400, height: 300 },
        settings: {
          series: [
            {
              key: "z",
              label: "Z",
              topic: "/ee_pose",
              messageType: "geometry_msgs/msg/PoseStamped",
              fieldPath: "pose.position.z",
            },
          ],
        },
      },
    ],
  };

  function sampleOn(topic: string, value: unknown) {
    return { type: "topic_sample", payload: { received_at: "t", topic, value, widget_id: "" } } as never;
  }

  it("delivers a sample only to the widgets that read its topic", () => {
    const data = appendRuntimeTopicSample({}, busy, sampleOn("/height", { data: 0.5 }));
    expect(Object.keys(data)).toEqual(["gauge"]);
  });

  it("reaches a series widget by one of its series topics, and the 3D view by its extra topics", () => {
    const plotted = appendRuntimeTopicSample({}, busy, sampleOn("/ee_pose", { pose: { position: { z: 0.4 } } }));
    // The 3D view names /ee_pose as its pose topic and the board plots it: both, and nothing else.
    expect(Object.keys(plotted).sort()).toEqual(["board", "view"]);
  });

  it("gives an unread topic nothing to do", () => {
    const untouched = appendRuntimeTopicSample({}, busy, sampleOn("/nobody", { data: 1 }));
    expect(untouched).toEqual({});
  });
});

describe("shared control on the wire", () => {
  const assisted: ScreenConfig = {
    ...screen,
    widgets: [
      {
        ...screen.widgets[0]!,
        settings: { ...screen.widgets[0]!.settings, goalsTopic: "/shared_control/goals", softGoalTopic: "/soft" },
      },
      {
        id: "bars",
        kind: "confidence-bars",
        title: "Goal confidence",
        layout: { x: 0, y: 0, width: 338, height: 160 },
        settings: { topic: "/shared_control/confidences", messageType: "std_msgs/msg/Float64MultiArray" },
      },
    ],
  };
  const sample = (topic: string, value: unknown, at = "2026-09-28T10:00:00.000Z") =>
    ({ type: "topic_sample", payload: { topic, value, received_at: at, widget_id: "view" } }) as never;
  const confidences = (values: number[]) => ({
    layout: { dim: [{ label: "agnostic,goal_0,goal_1", size: 3, stride: 3 }], data_offset: 0 },
    data: values,
  });

  it("subscribes the view to the goals and the soft goal, and the bars to the confidences", () => {
    const requests = createRuntimeTopicSubscriptionRequests(assisted).map((request) => request.topic);
    expect(requests).toEqual(expect.arrayContaining(["/shared_control/goals", "/soft", "/shared_control/confidences"]));
  });

  it("keeps the goals and the soft goal on the view's snapshot, each with its own arrival time", () => {
    const goals = { header: { frame_id: "base_link" }, poses: [{ position: { x: 0.5, y: 0, z: 0.3 } }] };
    let data = appendRuntimeTopicSample({}, assisted, sample("/shared_control/goals", goals, "2026-09-28T10:00:00Z"));
    const soft = { header: { frame_id: "base_link" }, pose: { position: { x: 0.4, y: 0, z: 0.3 } } };
    data = appendRuntimeTopicSample(data, assisted, sample("/soft", soft, "2026-09-28T10:00:05Z"));
    expect(data.view).toMatchObject({
      type: "robot-3d",
      goals,
      goalsReceivedAt: "2026-09-28T10:00:00Z",
      softGoal: soft,
      softGoalReceivedAt: "2026-09-28T10:00:05Z",
    });
  });

  it("never drops the last sample: a run of tiny steps still settles the bars at the true value", () => {
    let data = appendRuntimeTopicSample({}, assisted, sample("/shared_control/confidences", confidences([1, 0, 0])));
    const steps = Array.from({ length: 60 }, (_, index) => 0.003 * (index + 1));
    steps.forEach((value, index) => {
      const at = new Date(Date.UTC(2026, 8, 28, 10, 0, 0, 10 * (index + 1))).toISOString();
      data = appendRuntimeTopicSample(
        data,
        assisted,
        sample("/shared_control/confidences", confidences([1 - value, value, 0]), at),
      );
    });
    const bars = data.bars;
    const held = bars?.type === "topic-echo" ? (bars.messages.at(-1)?.value as { data: number[] }) : undefined;
    expect(held?.data[1]).toBeCloseTo(0.18, 2);
  });

  it("keeps a readable reading when an unreadable sample follows", () => {
    const first = appendRuntimeTopicSample({}, assisted, sample("/shared_control/confidences", confidences([1, 0, 0])));
    const broken = sample("/shared_control/confidences", { data: "nope" }, "2026-09-28T10:00:00.020Z");
    expect(appendRuntimeTopicSample(first, assisted, broken).bars).toBe(first.bars);
  });

  it("does not redraw a soft goal that moved under a millimetre", () => {
    const soft = { header: { frame_id: "base_link" }, pose: { position: { x: 0.4, y: 0, z: 0.3 } } };
    const first = appendRuntimeTopicSample({}, assisted, sample("/soft", soft));
    const nudged = { ...soft, pose: { position: { x: 0.4004, y: 0, z: 0.3 } } };
    expect(appendRuntimeTopicSample(first, assisted, sample("/soft", nudged)).view).toBe(first.view);
    const moved = { ...soft, pose: { position: { x: 0.45, y: 0, z: 0.3 } } };
    expect(appendRuntimeTopicSample(first, assisted, sample("/soft", moved)).view).not.toBe(first.view);
  });

  it("redraws the bars only when a confidence moved by a hundredth, or a second passed", () => {
    const first = appendRuntimeTopicSample({}, assisted, sample("/shared_control/confidences", confidences([1, 0, 0])));
    expect(first.bars).toMatchObject({ type: "topic-echo" });
    const same = sample("/shared_control/confidences", confidences([0.999, 0.001, 0]), "2026-09-28T10:00:00.010Z");
    expect(appendRuntimeTopicSample(first, assisted, same).bars).toBe(first.bars);
    const later = sample("/shared_control/confidences", confidences([0.999, 0.001, 0]), "2026-09-28T10:00:01.200Z");
    expect(appendRuntimeTopicSample(first, assisted, later).bars).not.toBe(first.bars);
    const changed = sample("/shared_control/confidences", confidences([0.9, 0.1, 0]), "2026-09-28T10:00:00.020Z");
    expect(appendRuntimeTopicSample(first, assisted, changed).bars).not.toBe(first.bars);
  });
});

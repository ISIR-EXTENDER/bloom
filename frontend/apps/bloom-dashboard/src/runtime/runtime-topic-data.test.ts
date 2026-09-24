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
      settings: { jointStateTopic: "/joint_states", markerTopic: "/goal_markers", showAxes: true },
    },
  ],
};

describe("a 3D robot view's subscriptions", () => {
  it("asks for the joint states and the marker array", () => {
    const requests = createRuntimeTopicSubscriptionRequests(screen);
    expect(requests.map((request) => [request.topic, request.message_type])).toEqual([
      ["/joint_states", "sensor_msgs/msg/JointState"],
      ["/goal_markers", "visualization_msgs/msg/MarkerArray"],
    ]);
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

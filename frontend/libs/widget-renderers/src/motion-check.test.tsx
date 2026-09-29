/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import {
  createDefaultWidgetRegistry,
  createMotionCheckState,
  MOTION_PROFILES,
  type MotionCheckState,
  type MotionRobot,
  type MotionStream,
  renderScreenDescriptors,
  stepMotionCheck,
} from "@bloom/widgets";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWidgetDescriptor } from "./index";

const motionScreen: ScreenConfig = {
  id: "command-motion",
  title: "Command vs motion",
  canvas: { preset_id: "full-hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "motion",
      kind: "motion-check",
      title: "Command vs motion",
      layout: { x: 14, y: 130, width: 1460, height: 892 },
      settings: { robot: "explorer", topic: "/joystick_cartesian_command" },
    },
  ],
};

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };
const pose = (x: number, y: number, z: number) => ({ orientation: IDENTITY, position: { x, y, z } });
const twist = (linear: Partial<Record<"x" | "y" | "z", number>>) => ({
  twist: { angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y: 0, z: 0, ...linear } },
});

function feed(robot: MotionRobot, steps: [MotionStream, unknown, number][]): MotionCheckState {
  return steps.reduce(
    (state, [stream, value, at]) => stepMotionCheck(state, stream, value, at),
    createMotionCheckState(robot),
  );
}

function renderPanel(state?: MotionCheckState) {
  const [descriptor] = renderScreenDescriptors(motionScreen, createDefaultWidgetRegistry());
  if (!descriptor) throw new Error("Missing descriptor.");
  return render(
    <div>
      {renderWidgetDescriptor(descriptor, {
        dataByWidgetId: state ? { motion: { state, type: "motion-check" } } : {},
      })}
    </div>,
  );
}

/** Forward on the Explorer: /ee_pose 6 cm along -x, the tip 5 cm and dipping 3 cm on the way, joint_2 0.28 rad short. */
function forwardDipping(): MotionCheckState {
  const joints = (gap: number) => ({ name: ["joint_1", "joint_2"], position: [0, 1 - gap] });
  return feed("explorer", [
    ["pose", { pose: pose(0.4, 0, 0.3) }, 0],
    ["tip", { child_frame_id: "ft_frame", ...pose(0.4, 0, 0.3) }, 0],
    ["jointCommand", { data: [0, 1] }, 0],
    ["twist", twist({ x: -1 }), 100],
    ["tip", pose(0.37, 0, 0.27), 500],
    ["pose", { pose: pose(0.34, 0, 0.3) }, 1000],
    ["tip", pose(0.35, 0, 0.295), 1000],
    ["joints", joints(0.28), 1000],
    ["twist", twist({}), 1050],
    ["joints", joints(0.28), 2000],
  ]);
}

describe("the Command vs motion panel", () => {
  afterEach(cleanup);

  it("asks for a push before anything was judged", () => {
    renderPanel();
    expect(screen.getByRole("region", { name: "Drive" })?.textContent).toContain("Waiting for /ee_pose.");
    expect(screen.getByRole("region", { name: "Gripper" })?.textContent).toContain("Press Open or Close");
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a push while it is held, with the wire and both hands", () => {
    renderPanel(
      feed("kinova", [
        ["pose", { pose: pose(0.4, 0, 0.3) }, 0],
        ["tip", pose(0.4, 0, 0.3), 0],
        ["twist", twist({ y: 1 }), 100],
        ["pose", { pose: pose(0.4, 0.04, 0.3) }, 500],
        ["tip", pose(0.4, 0.035, 0.3), 500],
      ]),
    );
    const drive = screen.getByRole("region", { name: "Drive" });
    expect(within(drive).getByText("held")).toBeTruthy();
    expect(drive.querySelector('[data-reading="wire"]')?.textContent).toContain("linear.y +1 · Forward");
    expect(drive.querySelector('[data-reading="commanded"]')?.textContent).toContain("+0.0 +4.0 +0.0 cm · 100% along");
    expect(drive.querySelector('[data-reading="measured"]')?.textContent).toContain("+0.0 +3.5 +0.0 cm");
    expect(drive.querySelector('[data-reading="agreement"]')?.textContent).toContain("100%");
  });

  // The owner's first scenario, as the bench reads it.
  it("reads Forward with the hand dipping as blocked, a WARN, with the dip and the joint short", () => {
    renderPanel(forwardDipping());
    const drive = screen.getByRole("region", { name: "Drive" });
    const chip = within(drive).getByText("blocked");
    expect(chip.getAttribute("data-grade")).toBe("warn");
    expect(drive.querySelector('[data-reading="dip"]')?.textContent).toContain("3.0 cm");
    expect(drive.querySelector('[data-reading="joints"]')?.textContent).toContain("joint_2 +0.28 rad");
    expect(drive?.textContent).toContain("sagged");
    const log = screen.getByRole("region", { name: "Verdict log" });
    expect(within(log).getAllByRole("row")).toHaveLength(2);
    expect(within(log).getByRole("rowheader")?.textContent).toContain("Forward");
  });

  // The owner's second scenario: Open, the finger still, then jumping after the wait.
  it("reads Open with the finger not moving then jumping as did not move within 4 s, and shows when it moved", () => {
    const finger = MOTION_PROFILES.explorer.finger;
    const steps: [MotionStream, unknown, number][] = [
      ["joints", { name: [finger], position: [1.0] }, 0],
      ["gripper", { data: [0.2] }, 100],
    ];
    for (let at = 200; at <= 7000; at += 100) {
      steps.push(["joints", { name: [finger], position: [at < 6000 ? 1.0 : 0.3] }, at]);
    }
    renderPanel(feed("explorer", steps));
    const gripper = screen.getByRole("region", { name: "Gripper" });
    expect(within(gripper).getByText("did not move within 4 s").getAttribute("data-grade")).toBe("warn");
    expect(gripper.querySelector('[data-reading="gripper-command"]')?.textContent).toContain("Open · 0.20");
    expect(gripper.querySelector('[data-reading="travel"]')?.textContent).toContain("opening (as asked)");
    expect(gripper?.textContent).toContain("Moved late, 5.90 s after the command.");
    expect(within(gripper).getByRole("img").getAttribute("aria-label")).toMatch(/from 1\.00 to 0\.30 rad/);
  });

  it("calls a clean press moves as asked, with its start and arrival", () => {
    const finger = MOTION_PROFILES.kinova.finger;
    const steps: [MotionStream, unknown, number][] = [
      ["joints", { name: [finger], position: [0] }, 0],
      ["gripper", { data: [0.8] }, 100],
    ];
    for (let at = 150; at <= 3000; at += 50) {
      steps.push(["joints", { name: [finger], position: [Math.min(0.8, Math.max(0, (at - 300) / 1000))] }, at]);
    }
    renderPanel(feed("kinova", steps));
    const gripper = screen.getByRole("region", { name: "Gripper" });
    expect(within(gripper).getByText("moves as asked").getAttribute("data-grade")).toBe("pass");
    expect(gripper.querySelector('[data-reading="start"]')?.textContent).toContain("250 ms");
    expect(gripper.querySelector('[data-reading="arrive"]')?.textContent).toContain("1.00 s");
  });

  it("exports the log as CSV for the bench", () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:motion";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPanel(forwardDipping());
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(created[0]?.type).toBe("text/csv");
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

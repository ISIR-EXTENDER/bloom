/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraWidget } from "./camera-renderer";
import type { WidgetRendererProps } from "./types";

function descriptor(settings: Record<string, unknown>, title = "Gripper") {
  return {
    widget: { id: "cam", kind: "camera", title, layout: { x: 0, y: 0, width: 400, height: 300 }, settings },
  } as unknown as WidgetRendererProps["descriptor"];
}

const TOPIC = "/camera/color/image_raw/compressed";
const ros = (extra: Record<string, unknown> = {}) => descriptor({ source: "ros-topic", topic: TOPIC, ...extra });

type Frame = Extract<WidgetRendererProps["data"], { type: "camera-frame" }>;
const frame = (overrides: Partial<Frame>): Frame => ({
  type: "camera-frame",
  topic: TOPIC,
  connected: true,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("a ROS camera", () => {
  it("names each silence: connecting, no ROS node, waiting for a frame", () => {
    const { rerender } = render(<CameraWidget descriptor={ros()} />);
    expect(screen.getByText("Connecting…")).toBeTruthy();
    rerender(<CameraWidget data={frame({ connected: false })} descriptor={ros()} />);
    expect(screen.getByText("This backend has no ROS node, so no camera can reach it.")).toBeTruthy();
    rerender(<CameraWidget data={frame({})} descriptor={ros()} />);
    expect(screen.getByText(`Waiting for a frame on ${TOPIC}.`)).toBeTruthy();
    expect(screen.getByText(TOPIC, { selector: ".bloom-camera-status" })).toBeTruthy();
  });

  it("shows the frame in the chosen fit and marks it stale once no new frame has come for two seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
    render(
      <CameraWidget
        data={frame({ frameUrl: "blob:one", receivedAt: Date.now() })}
        descriptor={ros({ fitMode: "cover", showHeader: false, showStatus: false })}
      />,
    );
    const image = screen.getByRole("img", { name: "Gripper" }) as HTMLImageElement;
    expect(image.src).toBe("blob:one");
    expect(image.style.objectFit).toBe("cover");
    expect(document.querySelector(".bloom-camera-frame")?.getAttribute("data-fit-mode")).toBe("cover");
    expect(document.querySelector(".bloom-camera-header")).toBeNull();
    expect(document.querySelector(".bloom-camera-status")).toBeNull();
    expect(document.querySelector(".bloom-camera-stale")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("No new frame for 3 s")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("The camera stopped sending.");
  });

  it("keeps the last frame while the stream reconnects and says why it closed", () => {
    const { rerender } = render(
      <CameraWidget
        data={frame({ frameUrl: "blob:one", receivedAt: Date.now(), detail: "ROS node stopped", reconnecting: true })}
        descriptor={ros()}
      />,
    );
    expect(screen.getByRole("img", { name: "Gripper" })).toBeTruthy();
    expect(screen.getByText("ROS node stopped Reconnecting…", { selector: ".bloom-camera-stale" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("ROS node stopped Reconnecting…");
    // Closed for good, before any frame: the placeholder carries the server's words, or the generic line.
    rerender(<CameraWidget data={frame({ detail: "not a valid name", reconnecting: false })} descriptor={ros()} />);
    expect(screen.getByText("not a valid name")).toBeTruthy();
    rerender(<CameraWidget data={frame({ reconnecting: true })} descriptor={ros()} />);
    expect(screen.getByText("The camera stream closed. Reconnecting…")).toBeTruthy();
  });

  it("asks for a topic when none is set", () => {
    render(<CameraWidget descriptor={descriptor({ source: "ros-topic" })} />);
    expect(screen.getByText("Name a compressed image topic to show a camera.")).toBeTruthy();
    expect(screen.getByText("Topic needed")).toBeTruthy();
  });
});

describe("a stream URL", () => {
  it("shows an image URL as a picture and anything else in a view-only frame", () => {
    const { rerender } = render(
      <CameraWidget descriptor={descriptor({ source: "placeholder", streamUrl: "http://cam/still.png?x=1" })} />,
    );
    expect((screen.getByRole("img", { name: "Gripper stream" }) as HTMLImageElement).src).toBe(
      "http://cam/still.png?x=1",
    );
    expect(screen.getByText("Stream configured")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();

    rerender(<CameraWidget descriptor={descriptor({ source: "placeholder", streamUrl: "http://cam/mjpeg" })} />);
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe("http://cam/mjpeg");
    expect(iframe.tabIndex).toBe(-1);
    expect(iframe.style.pointerEvents).toBe("none");

    rerender(<CameraWidget descriptor={descriptor({ source: "placeholder" })} />);
    expect(screen.getByText("No camera source configured yet.")).toBeTruthy();
    expect(screen.getByText("Source needed")).toBeTruthy();
  });
});

describe("a webcam", () => {
  type Device = { deviceId: string; kind: string; label: string };
  const devices: Device[] = [
    { deviceId: "id-a", kind: "videoinput", label: "Integrated Camera" },
    { deviceId: "mic", kind: "audioinput", label: "Microphone" },
    { deviceId: "id-b", kind: "videoinput", label: "" },
    { deviceId: "id-c", kind: "videoinput", label: "USB Video2 Cam" },
  ];

  function mediaDevices(deny = false) {
    const requests: unknown[] = [];
    const tracks = [{ stop: vi.fn() }];
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: async () => devices,
        getUserMedia: async (constraints: { video: true | { deviceId: { exact: string } } }) => {
          requests.push(constraints);
          const wanted = constraints.video === true ? null : constraints.video.deviceId.exact;
          if (deny || (wanted !== null && !devices.some((device) => device.deviceId === wanted))) {
            throw new Error(deny ? "NotAllowedError" : "OverconstrainedError");
          }
          return { getTracks: () => tracks };
        },
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: async () => undefined });
    return { requests, tracks };
  }

  it("says when the browser exposes no webcam, and when permission is denied", async () => {
    vi.stubGlobal("navigator", {});
    const { unmount } = render(<CameraWidget descriptor={descriptor({ source: "webcam" })} />);
    expect(screen.getByText("Webcam unsupported")).toBeTruthy();
    expect(screen.getByText("This browser preview does not expose webcam permissions.")).toBeTruthy();
    unmount();

    mediaDevices(true);
    render(<CameraWidget descriptor={descriptor({ source: "webcam" })} />);
    await waitFor(() => expect(screen.getByText("Webcam unavailable")).toBeTruthy());
    expect(screen.getByText("Webcam permission was denied or the camera is unavailable.")).toBeTruthy();
  });

  it("opens the default camera, lists the video inputs with a name each, and remembers the one picked", async () => {
    const { requests, tracks } = mediaDevices();
    const { unmount } = render(<CameraWidget descriptor={descriptor({ source: "webcam" })} />);
    await waitFor(() => expect(screen.getByText("Webcam live")).toBeTruthy());
    expect(requests).toEqual([{ audio: false, video: true }]);
    const picker = screen.getByLabelText("Camera") as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      "Auto",
      "Integrated Camera",
      "Camera 2",
      "USB Video2 Cam",
    ]);

    fireEvent.change(picker, { target: { value: "id-c" } });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ audio: false, video: { deviceId: { exact: "id-c" } } });
    // The switch stopped the first stream; the choice outlives the screen.
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(window.localStorage.getItem("bloom.webcam.device.cam")).toBe("id-c");
    unmount();

    render(<CameraWidget descriptor={descriptor({ source: "webcam", webcamPicker: false })} />);
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual({ audio: false, video: { deviceId: { exact: "id-c" } } });
    expect(screen.queryByLabelText("Camera")).toBeNull();
  });

  it("resolves a webcam:// address by device id, by label hint, or by the video node's index", async () => {
    const { requests } = mediaDevices();
    const { unmount } = render(
      <CameraWidget descriptor={descriptor({ source: "webcam", streamUrl: "webcam://id-b", showStatus: false })} />,
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ audio: false, video: { deviceId: { exact: "id-b" } } });
    expect(screen.getByText("webcam://id-b")).toBeTruthy();
    expect(document.querySelector(".bloom-camera-status")).toBeNull();
    unmount();

    render(<CameraWidget descriptor={descriptor({ source: "webcam", streamUrl: "webcam:///dev/video2" })} />);
    await waitFor(() => expect(requests).toHaveLength(2));
    // "video2" matches the USB camera's label before any index is tried.
    expect(requests[1]).toEqual({ audio: false, video: { deviceId: { exact: "id-c" } } });
    cleanup();

    render(<CameraWidget descriptor={descriptor({ source: "webcam", streamUrl: "webcam://video1" })} />);
    await waitFor(() => expect(requests).toHaveLength(3));
    // No label carries "video1": the second video input is the one at that index.
    expect(requests[2]).toEqual({ audio: false, video: { deviceId: { exact: "id-b" } } });
    cleanup();

    render(<CameraWidget descriptor={descriptor({ source: "webcam", streamUrl: "webcam://video9" })} />);
    await waitFor(() => expect(requests).toHaveLength(4));
    // Past the list, and past half the list: the browser's default.
    expect(requests[3]).toEqual({ audio: false, video: true });
    cleanup();

    render(<CameraWidget descriptor={descriptor({ source: "webcam", streamUrl: "webcam://default" })} />);
    await waitFor(() => expect(requests).toHaveLength(5));
    expect(requests[4]).toEqual({ audio: false, video: true });
  });

  it("falls back to the default camera when the remembered one is no longer plugged in", async () => {
    window.localStorage.setItem("bloom.webcam.device.cam", "gone");
    const { requests } = mediaDevices();
    render(<CameraWidget descriptor={descriptor({ source: "webcam" })} />);
    await waitFor(() => expect(screen.getByText("Webcam live")).toBeTruthy());
    expect((screen.getByLabelText("Camera") as HTMLSelectElement).value).toBe("");
    expect(window.localStorage.getItem("bloom.webcam.device.cam")).toBeNull();
    // The unplugged camera was asked for once; the default took over rather than an error that stays.
    expect(requests).toEqual([
      { audio: false, video: { deviceId: { exact: "gone" } } },
      { audio: false, video: true },
    ]);
  });
});

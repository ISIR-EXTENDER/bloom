import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { useEffect, useState } from "react";
import { resolveWebSocketProtocols, resolveWebSocketUrl } from "./websocket-url";

/**
 * One socket per camera widget, separate from the runtime socket.
 *
 * Frames are hundreds of times larger than a twist, so they never share the socket an operator is
 * steering by: the backend drops any telemetry field over 8192 elements for the same reason.
 */
export type CameraStreamTarget = {
  widgetId: string;
  topic: string;
};

export function resolveCameraStreamTargets(screen: ScreenConfig): CameraStreamTarget[] {
  const targets: CameraStreamTarget[] = [];
  for (const widget of screen.widgets) {
    if (widget.kind !== "camera" || widget.settings?.source !== "ros-topic") {
      continue;
    }
    const topic = typeof widget.settings?.topic === "string" ? widget.settings.topic.trim() : "";
    if (topic) {
      targets.push({ widgetId: widget.id, topic });
    }
  }
  return targets;
}

export function resolveCameraStreamUrl(apiBaseUrl: string, topic: string, origin?: string, apiKey = ""): string {
  return resolveWebSocketUrl(apiBaseUrl, "/api/v1/runtime/camera", { apiKey, origin, query: { topic } });
}

export const resolveCameraStreamProtocols = resolveWebSocketProtocols;

export function useCameraStreams(
  targets: readonly CameraStreamTarget[],
  apiBaseUrl: string,
  apiKey = "",
): Record<string, WidgetDataSnapshot> {
  const [frames, setFrames] = useState<Record<string, WidgetDataSnapshot>>({});
  // The effect reads the targets back out of this, so re-rendering with an equal list does not tear
  // every socket down and build it again. It is the only thing the sockets depend on.
  const key = JSON.stringify(targets.map((target) => [target.widgetId, target.topic]));

  useEffect(() => {
    const openTargets: CameraStreamTarget[] = (JSON.parse(key) as [string, string][]).map(([widgetId, topic]) => ({
      widgetId,
      topic,
    }));
    if (openTargets.length === 0) {
      setFrames({});
      return;
    }

    const sockets: WebSocket[] = [];
    // Each widget holds one object URL at a time; the previous one is revoked or the tab leaks.
    const objectUrls = new Map<string, string>();

    const publish = (widgetId: string, next: WidgetDataSnapshot) =>
      setFrames((current) => ({ ...current, [widgetId]: next }));

    const replaceFrame = (widgetId: string, topic: string, connected: boolean, blob: Blob) => {
      const previous = objectUrls.get(widgetId);
      const frameUrl = URL.createObjectURL(blob);
      objectUrls.set(widgetId, frameUrl);
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      publish(widgetId, { type: "camera-frame", topic, connected, frameUrl });
    };

    for (const target of openTargets) {
      let connected = false;
      const socket = new WebSocket(
        resolveCameraStreamUrl(apiBaseUrl, target.topic, undefined, apiKey),
        resolveCameraStreamProtocols(apiKey),
      );
      socket.binaryType = "blob";
      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          const opened = readOpenedMessage(event.data);
          if (opened) {
            connected = opened.connected;
            publish(target.widgetId, { type: "camera-frame", topic: target.topic, connected });
          }
          return;
        }
        replaceFrame(target.widgetId, target.topic, connected, event.data as Blob);
      };
      socket.onclose = (event) => {
        publish(target.widgetId, {
          type: "camera-frame",
          topic: target.topic,
          connected,
          // 1000 is this effect tearing the socket down, which is not a failure worth showing.
          detail: event.code === 1000 ? undefined : (event.reason ?? "") || "The camera stream closed.",
        });
      };
      sockets.push(socket);
    }

    return () => {
      for (const socket of sockets) {
        socket.onmessage = null;
        socket.onclose = null;
        socket.close(1000, "Screen closed.");
      }
      for (const objectUrl of objectUrls.values()) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [key, apiBaseUrl, apiKey]);

  return frames;
}

function readOpenedMessage(data: string): { connected: boolean } | null {
  try {
    const parsed = JSON.parse(data) as { type?: unknown; connected?: unknown };
    return parsed.type === "camera_stream_opened" ? { connected: parsed.connected === true } : null;
  } catch {
    return null;
  }
}

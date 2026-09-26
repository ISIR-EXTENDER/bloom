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

const CAMERA_RETRY_MAX_MS = 10000;

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

    // Only live sockets and pending retries: an outage retried for hours must not grow either.
    const sockets = new Set<WebSocket>();
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
      publish(widgetId, { type: "camera-frame", topic, connected, frameUrl, receivedAt: Date.now() });
    };

    let disposed = false;
    const retries = new Set<ReturnType<typeof setTimeout>>();
    const open = (target: CameraStreamTarget, attempt: number) => {
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
            attempt = 0;
            publish(target.widgetId, { type: "camera-frame", topic: target.topic, connected });
          }
          return;
        }
        replaceFrame(target.widgetId, target.topic, connected, event.data as Blob);
      };
      socket.onclose = (event) => {
        sockets.delete(socket);
        if (disposed) {
          return;
        }
        // Anything but a refused topic is worth another try: an API restart used to leave the placeholder
        // until the operator changed screen.
        const retryInMs = event.code === 1008 ? null : Math.min(CAMERA_RETRY_MAX_MS, 1000 * 2 ** attempt);
        setFrames((current) => ({
          ...current,
          [target.widgetId]: {
            ...(current[target.widgetId] ?? { type: "camera-frame", topic: target.topic, connected }),
            type: "camera-frame",
            topic: target.topic,
            connected,
            // The renderer words it in the operator's language; the server's own reason stays as sent.
            detail: event.reason || undefined,
            reconnecting: retryInMs !== null,
          } as WidgetDataSnapshot,
        }));
        if (retryInMs !== null) {
          const retry = setTimeout(() => {
            retries.delete(retry);
            open(target, attempt + 1);
          }, retryInMs);
          retries.add(retry);
        }
      };
      sockets.add(socket);
    };
    for (const target of openTargets) {
      open(target, 0);
    }

    return () => {
      disposed = true;
      for (const retry of retries) {
        clearTimeout(retry);
      }
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

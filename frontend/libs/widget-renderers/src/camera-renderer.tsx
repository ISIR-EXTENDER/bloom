import { useEffect, useRef, useState } from "react";
import { getBooleanSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function CameraWidget({ descriptor }: WidgetRendererProps) {
  const source = getStringSetting(descriptor.widget.settings, "source", "placeholder");
  const streamUrl = getStringSetting(descriptor.widget.settings, "streamUrl", "");
  const fitMode = getStringSetting(descriptor.widget.settings, "fitMode", "contain");
  const showHeader = getBooleanSetting(descriptor.widget.settings, "showHeader", true);
  const showStatus = getBooleanSetting(descriptor.widget.settings, "showStatus", true);
  const showWebcamPicker = getBooleanSetting(descriptor.widget.settings, "webcamPicker", true);

  return (
    <div className="bloom-camera-widget">
      {showHeader ? (
        <header className="bloom-camera-header">
          <strong>{descriptor.widget.title}</strong>
          <span>{source === "webcam" ? "Local camera" : streamUrl ? "Stream configured" : "No source"}</span>
        </header>
      ) : null}
      {source === "webcam" ? (
        <div className="bloom-camera-body">
          <WebcamPreview
            fitMode={fitMode}
            showPicker={showWebcamPicker}
            showStatus={showStatus}
            streamUrl={streamUrl}
            title={descriptor.widget.title}
            widgetId={descriptor.widget.id}
          />
        </div>
      ) : (
        <>
          <div className="bloom-camera-body">
            <div className="bloom-camera-frame" data-fit-mode={fitMode === "cover" ? "cover" : "contain"}>
              {streamUrl ? (
                <StreamPreview fitMode={fitMode} streamUrl={streamUrl} title={descriptor.widget.title} />
              ) : (
                <CameraPlaceholder message="No camera source configured yet." />
              )}
            </div>
          </div>
          {showStatus ? <span className="bloom-camera-status">{streamUrl ? "Ready" : "Source needed"}</span> : null}
        </>
      )}
    </div>
  );
}

function WebcamPreview({
  fitMode,
  showPicker,
  showStatus,
  streamUrl,
  title,
  widgetId,
}: {
  fitMode: string;
  showPicker: boolean;
  showStatus: boolean;
  streamUrl: string;
  title: string;
  widgetId: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [devices, setDevices] = useState<WebcamDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() =>
    readStoredWebcamDeviceId(`bloom.webcam.device.${widgetId}`),
  );
  const [status, setStatus] = useState<"idle" | "requesting" | "ready" | "unsupported" | "error">("idle");
  const preferenceKey = `bloom.webcam.device.${widgetId}`;

  useEffect(() => {
    storeWebcamDeviceId(preferenceKey, selectedDeviceId);
  }, [preferenceKey, selectedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId || devices.some((device) => device.deviceId === selectedDeviceId)) {
      return;
    }
    setSelectedDeviceId("");
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    let isCurrent = true;
    let stream: MediaStream | null = null;

    async function startWebcam() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }

      setStatus("requesting");

      try {
        stream = await openWebcamStream(streamUrl, selectedDeviceId);
        if (!isCurrent) {
          stopMediaStream(stream);
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            void videoRef.current?.play().catch(() => {
              // Browser autoplay policies can still delay playback until interaction.
            });
          };
        }
        setDevices(await listWebcamDevices());
        setStatus("ready");
      } catch {
        if (isCurrent) {
          setStatus("error");
        }
      }
    }

    startWebcam();

    return () => {
      isCurrent = false;
      stopMediaStream(stream);
    };
  }, [selectedDeviceId, streamUrl]);

  return (
    <>
      {showPicker ? (
        <label className="bloom-camera-picker" htmlFor={`bloom-webcam-picker-${widgetId}`}>
          <span>Camera</span>
          <select
            id={`bloom-webcam-picker-${widgetId}`}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            value={selectedDeviceId}
          >
            <option value="">Auto</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          {streamUrl ? <small>{streamUrl}</small> : null}
        </label>
      ) : null}
      <div className="bloom-camera-frame" data-fit-mode={fitMode === "cover" ? "cover" : "contain"}>
        <video aria-label={`${title} webcam preview`} autoPlay muted playsInline ref={videoRef} />
        {status !== "ready" ? <CameraPlaceholder message={getWebcamPlaceholderMessage(status)} /> : null}
      </div>
      {showStatus ? <span className="bloom-camera-status">{getWebcamStatusMessage(status)}</span> : null}
    </>
  );
}

type WebcamDeviceOption = {
  deviceId: string;
  label: string;
};

async function openWebcamStream(streamUrl: string, selectedDeviceId: string): Promise<MediaStream> {
  if (selectedDeviceId) {
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: selectedDeviceId } } });
  }

  const selector = parseWebcamSelector(streamUrl);

  if (selector.mode === "device-id") {
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: selector.value } } });
  }

  if (selector.mode === "label-hint") {
    const deviceId = await resolveWebcamDeviceIdByLabelHint(selector.value);
    if (deviceId) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId } } });
    }
  }

  return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
}

function parseWebcamSelector(
  streamUrl: string,
): { mode: "default" } | { mode: "device-id"; value: string } | { mode: "label-hint"; value: string } {
  const prefix = "webcam://";
  if (!streamUrl.toLowerCase().startsWith(prefix)) {
    return { mode: "default" };
  }

  const rawSelector = streamUrl.slice(prefix.length).trim();
  if (!rawSelector || rawSelector.toLowerCase() === "default") {
    return { mode: "default" };
  }

  const selector = decodeURIComponentSafe(rawSelector);
  const normalizedSelector = selector.toLowerCase();

  if (normalizedSelector.startsWith("/dev/video") || /^video\d+$/i.test(normalizedSelector)) {
    return { mode: "label-hint", value: normalizedSelector };
  }

  return { mode: "device-id", value: selector };
}

async function resolveWebcamDeviceIdByLabelHint(hint: string): Promise<string | null> {
  const devices = await listWebcamDevices();
  const normalizedHint = normalizeWebcamLabel(hint);

  for (const device of devices) {
    const normalizedLabel = normalizeWebcamLabel(device.label);
    if (normalizedLabel.includes(normalizedHint)) {
      return device.deviceId;
    }
  }

  const videoIndex = parseVideoNodeIndex(hint);
  if (videoIndex === null) {
    return null;
  }

  return devices[videoIndex]?.deviceId ?? devices[Math.floor(videoIndex / 2)]?.deviceId ?? null;
}

async function listWebcamDevices(): Promise<WebcamDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label?.trim() || `Camera ${index + 1}`,
    }));
}

function normalizeWebcamLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/dev\//, "");
}

function parseVideoNodeIndex(value: string): number | null {
  const match = value.match(/(?:^|\/)video(\d+)$/i);
  if (!match?.[1]) {
    return null;
  }

  const index = Number.parseInt(match[1], 10);
  return Number.isFinite(index) ? index : null;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readStoredWebcamDeviceId(preferenceKey: string): string {
  try {
    return window.localStorage.getItem(preferenceKey) ?? "";
  } catch {
    return "";
  }
}

function storeWebcamDeviceId(preferenceKey: string, deviceId: string) {
  try {
    if (!deviceId) {
      window.localStorage.removeItem(preferenceKey);
      return;
    }
    window.localStorage.setItem(preferenceKey, deviceId);
  } catch {
    // Ignore storage errors: the camera still works without persistence.
  }
}

function getWebcamPlaceholderMessage(status: "idle" | "requesting" | "ready" | "unsupported" | "error"): string {
  if (status === "unsupported") {
    return "This browser preview does not expose webcam permissions.";
  }
  if (status === "error") {
    return "Webcam permission was denied or the camera is unavailable.";
  }
  return "Waiting for webcam permission...";
}

function getWebcamStatusMessage(status: "idle" | "requesting" | "ready" | "unsupported" | "error"): string {
  switch (status) {
    case "ready":
      return "Webcam live";
    case "unsupported":
      return "Webcam unsupported";
    case "error":
      return "Webcam unavailable";
    case "requesting":
      return "Requesting webcam permission";
    case "idle":
      return "Preparing webcam";
  }
}

function StreamPreview({ fitMode, streamUrl, title }: { fitMode: string; streamUrl: string; title: string }) {
  if (isImageStreamUrl(streamUrl)) {
    return (
      <img alt={`${title} stream`} src={streamUrl} style={{ objectFit: fitMode === "cover" ? "cover" : "contain" }} />
    );
  }

  return (
    <iframe
      src={streamUrl}
      title={`${title} stream`}
      sandbox="allow-same-origin allow-scripts"
      referrerPolicy="no-referrer"
    />
  );
}

function CameraPlaceholder({ message }: { message: string }) {
  return (
    <div className="bloom-camera-placeholder">
      <span aria-hidden="true">◌</span>
      <p>{message}</p>
    </div>
  );
}

function stopMediaStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

function isImageStreamUrl(streamUrl: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(streamUrl);
}

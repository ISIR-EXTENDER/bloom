import { getBooleanSetting, getStringSetting } from "@bloom/widgets";
import { useEffect, useRef, useState } from "react";
import { type RendererStrings, rendererStrings } from "./renderer-strings";
import type { WidgetRendererProps } from "./types";

export function CameraWidget({ data, descriptor, language }: WidgetRendererProps) {
  const text = rendererStrings(language);
  const source = getStringSetting(descriptor.widget.settings, "source", "placeholder");
  const streamUrl = getStringSetting(descriptor.widget.settings, "streamUrl", "");
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const fitMode = getStringSetting(descriptor.widget.settings, "fitMode", "contain");
  const showHeader = getBooleanSetting(descriptor.widget.settings, "showHeader", true);
  const showStatus = getBooleanSetting(descriptor.widget.settings, "showStatus", true);
  const showWebcamPicker = getBooleanSetting(descriptor.widget.settings, "webcamPicker", true);
  const frame = data?.type === "camera-frame" ? data : undefined;

  return (
    <div className="bloom-camera-widget">
      {showHeader ? (
        <header className="bloom-camera-header">
          <strong>{descriptor.widget.title}</strong>
          <span>{describeCameraSource(source, streamUrl, topic, text)}</span>
        </header>
      ) : null}
      {source === "ros-topic" ? (
        <>
          <div className="bloom-camera-body">
            <div className="bloom-camera-frame" data-fit-mode={fitMode === "cover" ? "cover" : "contain"}>
              {frame?.frameUrl ? (
                <>
                  <img
                    alt={descriptor.widget.title}
                    className="bloom-camera-image"
                    src={frame.frameUrl}
                    style={{ objectFit: fitMode === "cover" ? "cover" : "contain" }}
                  />
                  <CameraStaleBadge
                    detail={describeClosedStream(frame, text)}
                    receivedAt={frame.receivedAt}
                    text={text}
                  />
                </>
              ) : (
                <CameraPlaceholder message={describeRosCameraStatus(topic, frame, text)} />
              )}
            </div>
          </div>
          {/* The placeholder already carries the reason; the status line stays the short label. */}
          {showStatus ? <span className="bloom-camera-status">{topic || text.cameraTopicNeeded}</span> : null}
        </>
      ) : source === "webcam" ? (
        <div className="bloom-camera-body">
          <WebcamPreview
            fitMode={fitMode}
            showPicker={showWebcamPicker}
            showStatus={showStatus}
            streamUrl={streamUrl}
            text={text}
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
                <CameraPlaceholder message={text.cameraNotConfigured} />
              )}
            </div>
          </div>
          {showStatus ? (
            <span className="bloom-camera-status">{streamUrl ? text.cameraReady : text.cameraSourceNeeded}</span>
          ) : null}
        </>
      )}
    </div>
  );
}

const CAMERA_STALE_MS = 2000;

/** The last frame of a camera that stopped looks exactly like a live one; this says how old it is. */
function CameraStaleBadge({
  detail,
  receivedAt,
  text,
}: {
  detail?: string;
  receivedAt?: number;
  text: RendererStrings;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const ageMs = receivedAt === undefined ? 0 : now - receivedAt;
  if (!detail && ageMs < CAMERA_STALE_MS) {
    return null;
  }
  // The count ticks every second; announced, it buried everything else. The live region says the change once.
  return (
    <>
      <span aria-hidden="true" className="bloom-camera-stale">
        {detail ?? text.cameraStale(Math.floor(ageMs / 1000))}
      </span>
      <span className="sr-only" role="status">
        {detail ?? text.cameraStalled}
      </span>
    </>
  );
}

function describeCameraSource(source: string, streamUrl: string, topic: string, text: RendererStrings): string {
  if (source === "ros-topic") {
    return topic || text.cameraNoTopic;
  }
  if (source === "webcam") {
    return text.cameraLocal;
  }
  return streamUrl ? text.cameraStreamConfigured : text.cameraNoSource;
}

/** Each state names what to do about it; "no image" alone sends an operator hunting the wrong thing. */
type CameraFrameState = { connected: boolean; frameUrl?: string; detail?: string; reconnecting?: boolean };

function describeClosedStream(frame: CameraFrameState, text: RendererStrings): string | undefined {
  if (!frame.detail && !frame.reconnecting) {
    return undefined;
  }
  const reason = frame.detail || text.cameraClosed;
  return frame.reconnecting ? `${reason} ${text.cameraReconnecting}` : reason;
}

function describeRosCameraStatus(topic: string, frame: CameraFrameState | undefined, text: RendererStrings): string {
  if (!topic) {
    return text.cameraNameTopic;
  }
  if (!frame) {
    return text.cameraConnecting;
  }
  const closed = describeClosedStream(frame, text);
  if (closed) {
    return closed;
  }
  if (!frame.connected) {
    return text.cameraNoRos;
  }
  return frame.frameUrl ? topic : text.cameraWaiting(topic);
}

function WebcamPreview({
  fitMode,
  showPicker,
  showStatus,
  streamUrl,
  text,
  title,
  widgetId,
}: {
  fitMode: string;
  showPicker: boolean;
  showStatus: boolean;
  streamUrl: string;
  text: RendererStrings;
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
          <span>{text.cameraPicker}</span>
          <select
            id={`bloom-webcam-picker-${widgetId}`}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            value={selectedDeviceId}
          >
            <option value="">{text.cameraAuto}</option>
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
      {showStatus ? <span className="bloom-camera-status">{text.webcamStatus[status]}</span> : null}
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

function StreamPreview({ fitMode, streamUrl, title }: { fitMode: string; streamUrl: string; title: string }) {
  if (isImageStreamUrl(streamUrl)) {
    return (
      <img alt={`${title} stream`} src={streamUrl} style={{ objectFit: fitMode === "cover" ? "cover" : "contain" }} />
    );
  }

  return (
    // View only: focus inside the frame took the switch keys and taps away from the scanner.
    <iframe
      src={streamUrl}
      title={`${title} stream`}
      sandbox="allow-same-origin allow-scripts"
      referrerPolicy="no-referrer"
      style={{ pointerEvents: "none" }}
      tabIndex={-1}
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

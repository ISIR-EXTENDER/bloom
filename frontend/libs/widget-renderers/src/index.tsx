import type { WidgetKind } from "@bloom/api-client";
import {
  createWidgetActionIntent,
  formatTopicEchoValue,
  type TopicMessage,
  type TopicPlotSample,
  type WidgetActionIntent,
  type WidgetRenderContext,
  type WidgetRenderDescriptor,
} from "@bloom/widgets";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type JoystickLabels, JoystickPrimitive, type JoystickVector } from "./JoystickPrimitive";

export type WidgetRendererProps = {
  data?: WidgetDataSnapshot;
  descriptor: Extract<WidgetRenderDescriptor, { status: "resolved" }>;
  onActionIntent?: WidgetActionIntentHandler;
};

export type UnknownWidgetRendererProps = {
  descriptor: Extract<WidgetRenderDescriptor, { status: "unknown" }>;
};

export type WidgetRenderer = (props: WidgetRendererProps) => ReactNode;

export type UnknownWidgetRenderer = (props: UnknownWidgetRendererProps) => ReactNode;

export type WidgetActionIntentHandler = (intent: WidgetActionIntent) => void;

export type WidgetDataSnapshot =
  | {
      messages: readonly TopicMessage[];
      type: "topic-echo";
    }
  | {
      samples: readonly TopicPlotSample[];
      type: "topic-plot";
    };

export type WidgetRendererRegistration = {
  kind: WidgetKind;
  render: WidgetRenderer;
};

export type WidgetRendererRegistry = ReadonlyMap<WidgetKind, WidgetRenderer>;

export type ScreenRendererOptions = {
  dataByWidgetId?: Readonly<Record<string, WidgetDataSnapshot>>;
  onActionIntent?: WidgetActionIntentHandler;
  renderUnknown?: UnknownWidgetRenderer;
  registry?: WidgetRendererRegistry;
};

const DEFAULT_WIDGET_RENDERERS: readonly WidgetRendererRegistration[] = [
  { kind: "button", render: CommandLikeWidget },
  { kind: "command-button", render: CommandLikeWidget },
  { kind: "label", render: LabelWidget },
  { kind: "toggle", render: ToggleWidget },
  { kind: "slider", render: SliderWidget },
  { kind: "joystick", render: JoystickWidget },
  { kind: "camera", render: CameraWidget },
  { kind: "gauge", render: PlaceholderWidget },
  { kind: "plot", render: PlaceholderWidget },
  { kind: "topic-echo", render: TopicDebugWidget },
  { kind: "topic-plot", render: TopicDebugWidget },
  { kind: "unknown", render: PlaceholderWidget },
];

export function createWidgetRendererRegistry(
  registrations: readonly WidgetRendererRegistration[] = DEFAULT_WIDGET_RENDERERS,
): WidgetRendererRegistry {
  const registry = new Map<WidgetKind, WidgetRenderer>();

  for (const registration of registrations) {
    if (registry.has(registration.kind)) {
      throw new Error(`Duplicate widget renderer for kind "${registration.kind}".`);
    }
    registry.set(registration.kind, registration.render);
  }

  return registry;
}

export function renderWidgetDescriptor(
  descriptor: WidgetRenderDescriptor,
  options: ScreenRendererOptions = {},
): ReactNode {
  if (descriptor.status === "unknown") {
    const renderUnknown = options.renderUnknown ?? UnknownWidget;
    return renderUnknown({ descriptor });
  }

  const registry = options.registry ?? createWidgetRendererRegistry();
  const renderer = registry.get(descriptor.definition.kind);
  if (!renderer) {
    return (
      <UnknownWidget
        descriptor={{
          status: "unknown",
          widget: descriptor.widget,
          context: descriptor.context,
          reason: `No React renderer registered for kind "${descriptor.definition.kind}".`,
        }}
      />
    );
  }

  const Renderer = renderer;
  return (
    <Renderer
      data={options.dataByWidgetId?.[descriptor.widget.id]}
      descriptor={descriptor}
      onActionIntent={options.onActionIntent}
    />
  );
}

export function renderScreenWidgets(
  descriptors: readonly WidgetRenderDescriptor[],
  options: ScreenRendererOptions = {},
): ReactNode[] {
  return descriptors.map((descriptor) => (
    <WidgetFrame context={descriptor.context} descriptor={descriptor} key={descriptor.widget.id}>
      {renderWidgetDescriptor(descriptor, options)}
    </WidgetFrame>
  ));
}

function WidgetFrame({
  children,
  descriptor,
}: {
  children: ReactNode;
  context: WidgetRenderContext;
  descriptor: WidgetRenderDescriptor;
}) {
  const { widget } = descriptor;

  return (
    <article
      className={`widget-preview-card widget-preview-${descriptor.status}`}
      data-screen-id={descriptor.context.screenId}
      data-widget-kind={widget.kind}
      style={{
        left: `${widget.layout.x}px`,
        top: `${widget.layout.y}px`,
        width: `${widget.layout.width}px`,
        height: `${widget.layout.height}px`,
      }}
    >
      {children}
    </article>
  );
}

function CommandLikeWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const handlePress = () => {
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "press" }));
  };

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <button className="bloom-command-button" onClick={handlePress} type="button">
        Send
      </button>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

function LabelWidget({ descriptor }: WidgetRendererProps) {
  const text = getStringSetting(descriptor.widget.settings, "text", descriptor.widget.title);

  return (
    <>
      <strong>{text}</strong>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

function ToggleWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "");
  const [isOn, setIsOn] = useState(getBooleanSetting(descriptor.widget.settings, "initialValue", false));

  const handleToggle = () => {
    const nextState = isOn ? "off" : "on";
    setIsOn(nextState === "on");
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { nextState, type: "toggle" }));
  };

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <button
        aria-pressed={isOn}
        className={`bloom-toggle-button ${isOn ? "is-on" : "is-off"}`}
        onClick={handleToggle}
        type="button"
      >
        {isOn ? "ON" : "OFF"}
      </button>
      <span>{topic || descriptor.definition.displayName}</span>
    </>
  );
}

function SliderWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", -1);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  const step = getNumberSetting(descriptor.widget.settings, "step", 0.01);
  const direction = getStringSetting(descriptor.widget.settings, "direction", "vertical");
  const defaultValue = clamp(0, min, max);
  const [currentValue, setCurrentValue] = useState(defaultValue);

  const handleValueChange = (values: number[]) => {
    const value = values[0];
    if (value === undefined) {
      return;
    }
    setCurrentValue(value);
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-value", value }));
  };

  return (
    <div className="bloom-slider-widget" data-direction={direction === "horizontal" ? "horizontal" : "vertical"}>
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>
          {min} → {max}
        </span>
      </header>
      <SliderPrimitive.Root
        className={`bloom-slider bloom-slider-${direction === "horizontal" ? "horizontal" : "vertical"}`}
        data-orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        defaultValue={[defaultValue]}
        max={max}
        min={min}
        onValueChange={handleValueChange}
        orientation={direction === "horizontal" ? "horizontal" : "vertical"}
        step={step}
      >
        <SliderPrimitive.Track className="bloom-slider-track">
          <SliderPrimitive.Range className="bloom-slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={descriptor.widget.title} className="bloom-slider-thumb" />
      </SliderPrimitive.Root>
      <output aria-live="polite" className="bloom-control-readout">
        {currentValue.toFixed(resolveDecimalPlaces(step))}
      </output>
    </div>
  );
}

function JoystickWidget({ descriptor, onActionIntent }: WidgetRendererProps) {
  const binding = getStringSetting(descriptor.widget.settings, "binding", "input");
  const deadzone = getNumberSetting(descriptor.widget.settings, "deadzone", 0.1);
  const labels = getJoystickLabels(descriptor.widget.settings);
  const color = getStringSetting(descriptor.widget.settings, "accentColor", "#7fa95f");
  const size = resolveJoystickControlSize(descriptor.widget.layout.width, descriptor.widget.layout.height);
  const [currentVector, setCurrentVector] = useState<JoystickVector>({ x: 0, y: 0 });

  const handleVectorChange = (value: JoystickVector) => {
    setCurrentVector(value);
    onActionIntent?.(createWidgetActionIntent(descriptor.widget, { type: "set-vector", value }));
  };

  return (
    <div className="bloom-joystick-widget">
      <header className="bloom-control-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{binding}</span>
      </header>
      <JoystickPrimitive
        color={color}
        deadzone={deadzone}
        labels={labels}
        onVectorChange={handleVectorChange}
        size={size}
        title={descriptor.widget.title}
      />
      <output aria-live="polite" className="bloom-control-vector-readout">
        <span>x {currentVector.x.toFixed(2)}</span>
        <span>y {currentVector.y.toFixed(2)}</span>
      </output>
    </div>
  );
}

function CameraWidget({ descriptor }: WidgetRendererProps) {
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
          <span>{source === "webcam" ? "Browser camera" : streamUrl || descriptor.definition.displayName}</span>
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
          {showStatus ? (
            <span className="bloom-camera-status">{streamUrl ? "Stream preview" : "Source not configured"}</span>
          ) : null}
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

function PlaceholderWidget({ descriptor }: WidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

function TopicDebugWidget({ data, descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "No topic configured");
  const fieldPath = getStringSetting(descriptor.widget.settings, "fieldPath", "");

  if (descriptor.widget.kind === "topic-echo") {
    const messages = data?.type === "topic-echo" ? data.messages : [];
    return (
      <>
        <strong>{descriptor.widget.title}</strong>
        <span>{topic}</span>
        <pre className="bloom-topic-echo">
          {messages.length > 0
            ? messages.map((message) => formatTopicEchoValue(message.value, true)).join("\n---\n")
            : "Waiting for messages..."}
        </pre>
      </>
    );
  }

  if (descriptor.widget.kind === "topic-plot") {
    const samples = data?.type === "topic-plot" ? data.samples : [];
    const latestSample = samples.at(-1);
    return (
      <>
        <strong>{descriptor.widget.title}</strong>
        <span>{topic}</span>
        <div className="bloom-topic-plot" data-sample-count={samples.length}>
          <span>{latestSample ? `latest: ${latestSample.value}` : "Waiting for samples..."}</span>
        </div>
        <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span>
      </>
    );
  }

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{topic}</span>
      <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span>
    </>
  );
}

function UnknownWidget({ descriptor }: UnknownWidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{descriptor.reason}</span>
    </>
  );
}

function getStringSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBooleanSetting(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

function getJoystickLabels(settings: Record<string, unknown>): JoystickLabels {
  const labels = settings.labels;
  if (!isRecord(labels)) {
    return { bottom: "Y-", left: "X-", right: "X+", top: "Y+" };
  }

  return {
    bottom: getStringSetting(labels, "bottom", "Y-"),
    left: getStringSetting(labels, "left", "X-"),
    right: getStringSetting(labels, "right", "X+"),
    top: getStringSetting(labels, "top", "Y+"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveJoystickControlSize(width: number, height: number): number {
  const horizontalRoom = Math.max(96, width - 56);
  const verticalRoom = Math.max(96, height - 118);
  return Math.round(clamp(Math.min(horizontalRoom, verticalRoom), 96, 260));
}

function resolveDecimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 2;
  }

  const stepText = step.toString();
  if (!stepText.includes(".")) {
    return 0;
  }

  return Math.min(4, stepText.split(".")[1]?.length ?? 2);
}

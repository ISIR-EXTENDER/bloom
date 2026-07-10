import type { ApplicationConfig, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler, WidgetDataSnapshot } from "@bloom/widget-renderers";
import { appendTopicEchoMessage, appendTopicPlotSample, resolveCanvasFitScale } from "@bloom/widgets";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveScreenArtboardLayout, ScreenArtboard } from "../screen/ScreenArtboard";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { BloomDebugPanel } from "./BloomDebugPanel";
import { RuntimeRobotStatusPanel } from "./RuntimeRobotStatusPanel";
import type {
  RuntimeActionClient,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";
import { createRuntimeControlStateByWidgetId, type RuntimeModeState } from "./runtimeModeState";
import { resolveRuntimeProfile } from "./runtimeProfile";

const FIT_OVERFLOW_GUARD = 0.99;

type RuntimeViewportSize = {
  height: number;
  width: number;
};

type ApplicationRuntimeContext = Pick<ApplicationConfig, "action_presets" | "runtime_policy"> & {
  appId: string;
  configId: string;
};

type RuntimeWorkspaceProps = {
  application: ApplicationConfig;
  onBackToRuntimeHome: () => void;
  onActionIntent: (
    intent: Parameters<WidgetActionIntentHandler>[0],
    runtimeContext?: ApplicationRuntimeContext,
  ) => void;
  onEditApplication: () => void;
  onEditScreen: () => void;
  onOpenBuilderHome: () => void;
  onOpenHelp: () => void;
  onOpenLanding: () => void;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onTopicSample?: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest?: (request: RuntimeTopicSubscriptionRequest) => void;
  preferredProfileId?: string;
  runtimeActionClient: RuntimeActionClient;
  runtimeModeState: RuntimeModeState;
  screen: ScreenConfig;
  selection: WorkspaceSelection;
};

export function RuntimeWorkspace({
  application,
  onBackToRuntimeHome,
  onActionIntent,
  onEditApplication,
  onEditScreen,
  onOpenBuilderHome,
  onOpenHelp,
  onOpenLanding,
  onSelectionChange,
  onTopicSample,
  onTopicSubscriptionRequest,
  preferredProfileId = "",
  runtimeActionClient,
  runtimeModeState,
  screen,
  selection,
}: RuntimeWorkspaceProps) {
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<RuntimeViewportSize>(() => getWindowViewportSize());
  const { artboardSize } = resolveScreenArtboardLayout(screen);
  const artboardScale = useMemo(() => {
    const rawScale = resolveCanvasFitScale(screen.canvas, artboardSize, viewportSize);

    return screen.canvas.runtime_mode === "fit" ? rawScale * FIT_OVERFLOW_GUARD : rawScale;
  }, [artboardSize, screen.canvas, viewportSize]);
  const scaledArtboardSize = useMemo(
    () => ({
      height: Math.max(1, Math.floor(artboardSize.height * artboardScale)),
      width: Math.max(1, Math.floor(artboardSize.width * artboardScale)),
    }),
    [artboardScale, artboardSize],
  );
  const runtimeProfile = useMemo(
    () => resolveRuntimeProfile(application, viewportSize, preferredProfileId),
    [application, preferredProfileId, viewportSize],
  );
  const controlStateByWidgetId = useMemo(
    () => createRuntimeControlStateByWidgetId(screen, runtimeModeState),
    [runtimeModeState, screen],
  );
  const [dataByWidgetId, setDataByWidgetId] = useState<Record<string, WidgetDataSnapshot>>({});
  const previousScreenIdRef = useRef(screen.id);
  const handleRuntimeActionIntent: WidgetActionIntentHandler = (intent) => {
    onActionIntent(intent, {
      action_presets: application.action_presets,
      appId: selection.appId,
      configId: selection.configId,
      runtime_policy: application.runtime_policy,
    });
  };

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize(measureViewportSize(viewport));
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", updateViewportSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  useEffect(() => {
    if (!onTopicSubscriptionRequest) {
      return;
    }

    for (const request of createRuntimeTopicSubscriptionRequests(screen)) {
      onTopicSubscriptionRequest(request);
    }
  }, [onTopicSubscriptionRequest, screen]);

  useEffect(() => {
    if (previousScreenIdRef.current === screen.id) {
      return;
    }
    previousScreenIdRef.current = screen.id;
    setDataByWidgetId({});
  }, [screen.id]);

  useEffect(() => {
    if (!onTopicSample) {
      return;
    }

    return onTopicSample((sample) => {
      setDataByWidgetId((currentData) => appendRuntimeTopicSample(currentData, screen, sample));
    });
  }, [onTopicSample, screen]);

  return (
    <section
      aria-label="Runtime application"
      className="runtime-app-workspace"
      data-display-preset={runtimeProfile.displayPreset}
      data-has-debug={application.id === "bloom-debug" ? "true" : "false"}
      data-motor-accessibility-preset={runtimeProfile.motorAccessibilityPreset}
      data-runtime-layout="operator"
      style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
    >
      <header className="runtime-app-topbar">
        <div>
          <p className="eyebrow">Runtime app</p>
          <h2>{application.name}</h2>
          <p className="runtime-profile-label">{runtimeProfile.name}</p>
          <p className="runtime-active-screen-label">{screen.title}</p>
        </div>

        {application.screens.length > 1 ? (
          <nav className="runtime-screen-tabs" aria-label="Switch runtime screen">
            {application.screens.map((availableScreen) => (
              <button
                aria-current={screen.id === availableScreen.id ? "page" : undefined}
                className="runtime-screen-tab"
                key={availableScreen.id}
                onClick={() =>
                  onSelectionChange({
                    ...selection,
                    screenId: availableScreen.id,
                  })
                }
                type="button"
              >
                {availableScreen.title}
              </button>
            ))}
          </nav>
        ) : null}

        <details className="runtime-app-menu">
          <summary aria-label="Open runtime menu">Menu</summary>
          <nav className="runtime-app-actions" aria-label="Runtime shortcuts">
            <button className="runtime-app-action" onClick={onOpenLanding} type="button">
              Home
            </button>
            <button className="runtime-app-action" onClick={onBackToRuntimeHome} type="button">
              App library
            </button>
            <button className="runtime-app-action" onClick={onOpenBuilderHome} type="button">
              Builder
            </button>
            <button className="runtime-app-action" onClick={onOpenHelp} type="button">
              Help
            </button>
            <button className="runtime-app-action" onClick={onEditApplication} type="button">
              Edit app
            </button>
            <button className="runtime-app-action" onClick={onEditScreen} type="button">
              Edit screen
            </button>
          </nav>
        </details>
      </header>

      <RuntimeRobotStatusPanel application={application} client={runtimeActionClient} modeState={runtimeModeState} />

      {application.id === "bloom-debug" ? <BloomDebugPanel client={runtimeActionClient} /> : null}

      <div className="runtime-app-canvas-shell">
        <div
          className="runtime-app-canvas-viewport"
          data-runtime-mode={screen.canvas.runtime_mode}
          ref={canvasViewportRef}
        >
          <div
            className="runtime-app-artboard-frame"
            style={{
              height: `${scaledArtboardSize.height}px`,
              width: `${scaledArtboardSize.width}px`,
            }}
          >
            <ScreenArtboard
              className="runtime-app-artboard"
              renderEmptyState={(emptyScreen) => <RuntimeComingSoonMessage screen={emptyScreen} />}
              rendererOptions={{ controlStateByWidgetId, dataByWidgetId, onActionIntent: handleRuntimeActionIntent }}
              screen={screen}
              style={{
                height: `${artboardSize.height}px`,
                transform: `scale(${artboardScale})`,
                width: `${artboardSize.width}px`,
              }}
              testId="runtime-artboard"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function createRuntimeTopicSubscriptionRequests(screen: ScreenConfig): RuntimeTopicSubscriptionRequest[] {
  return screen.widgets.flatMap((widget) => {
    const topic = resolveWidgetRuntimeTopic(widget);
    if (!topic?.startsWith("/")) {
      return [];
    }

    return [
      {
        type: "subscribe_topic",
        topic,
        message_type: resolveWidgetRuntimeMessageType(widget),
        field_path: resolveWidgetRuntimeFieldPath(widget),
        widget_id: widget.id,
      },
    ];
  });
}

function appendRuntimeTopicSample(
  currentData: Readonly<Record<string, WidgetDataSnapshot>>,
  screen: ScreenConfig,
  sample: RuntimeTopicSampleMessage,
): Record<string, WidgetDataSnapshot> {
  let nextData: Record<string, WidgetDataSnapshot> | null = null;
  const topicMessage = {
    receivedAt: sample.payload.received_at,
    topic: sample.payload.topic,
    value: sample.payload.value,
  };

  for (const widget of screen.widgets) {
    if (resolveWidgetRuntimeTopic(widget) !== sample.payload.topic) {
      continue;
    }

    if (widget.kind === "topic-echo") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentMessages = currentWidgetData?.type === "topic-echo" ? currentWidgetData.messages : [];
      nextData[widget.id] = {
        type: "topic-echo",
        messages: appendTopicEchoMessage(currentMessages, topicMessage, {
          fieldPath: readStringSetting(widget.settings, "fieldPath") ?? "",
          maxMessages: readNumberSetting(widget.settings, "maxMessages", 100),
        }),
      };
    }

    if (widget.kind === "event-log") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentMessages = currentWidgetData?.type === "event-log" ? currentWidgetData.messages : [];
      nextData[widget.id] = {
        type: "event-log",
        messages: appendTopicEchoMessage(currentMessages, topicMessage, {
          fieldPath: readStringSetting(widget.settings, "fieldPath") ?? "",
          maxMessages: readNumberSetting(widget.settings, "maxEntries", 20),
        }),
      };
    }

    if (widget.kind === "topic-plot") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentSamples = currentWidgetData?.type === "topic-plot" ? currentWidgetData.samples : [];
      nextData[widget.id] = {
        type: "topic-plot",
        samples: appendTopicPlotSample(currentSamples, topicMessage, {
          fieldPath: readStringSetting(widget.settings, "fieldPath") ?? "data",
          historySeconds: readNumberSetting(widget.settings, "historySeconds", 30),
          maxSamples: readNumberSetting(widget.settings, "maxSamples", 500),
        }),
      };
    }

    if (widget.kind === "gauge") {
      const samples = appendTopicPlotSample([], topicMessage, {
        fieldPath: readStringSetting(widget.settings, "fieldPath") ?? "data",
        historySeconds: 1,
        maxSamples: 1,
      });
      const latestSample = samples.at(-1);
      if (!latestSample) {
        continue;
      }

      nextData = nextData ?? { ...currentData };
      nextData[widget.id] = {
        receivedAt: topicMessage.receivedAt,
        topic: topicMessage.topic,
        type: "gauge",
        value: latestSample.value,
      };
    }

    if (widget.kind === "plot") {
      nextData = nextData ?? { ...currentData };
      const currentWidgetData = currentData[widget.id];
      const currentSamples = currentWidgetData?.type === "plot" ? currentWidgetData.samples : [];
      nextData[widget.id] = {
        type: "plot",
        samples: appendTopicPlotSample(currentSamples, topicMessage, {
          fieldPath: readStringSetting(widget.settings, "fieldPath") ?? "data",
          historySeconds: readNumberSetting(widget.settings, "historySeconds", 30),
          maxSamples: readNumberSetting(widget.settings, "maxSamples", 500),
        }),
      };
    }

    if (widget.kind === "robot-3d") {
      nextData = nextData ?? { ...currentData };
      nextData[widget.id] = {
        receivedAt: topicMessage.receivedAt,
        topic: topicMessage.topic,
        type: "robot-3d",
        value: topicMessage.value,
      };
    }
  }

  return nextData ?? { ...currentData };
}

function resolveWidgetRuntimeTopic(widget: WidgetConfig): string | undefined {
  if (widget.kind === "robot-3d") {
    return readStringSetting(widget.settings, "jointStateTopic") ?? "/joint_states";
  }
  if (
    widget.kind === "gauge" ||
    widget.kind === "event-log" ||
    widget.kind === "plot" ||
    widget.kind === "topic-echo" ||
    widget.kind === "topic-plot"
  ) {
    return readStringSetting(widget.settings, "topic");
  }
  return undefined;
}

function resolveWidgetRuntimeMessageType(widget: WidgetConfig): string {
  if (widget.kind === "robot-3d") {
    return "sensor_msgs/msg/JointState";
  }
  return readStringSetting(widget.settings, "messageType") ?? "";
}

function resolveWidgetRuntimeFieldPath(widget: WidgetConfig): string {
  if (widget.kind === "gauge" || widget.kind === "plot" || widget.kind === "topic-plot") {
    return readStringSetting(widget.settings, "fieldPath") ?? "data";
  }
  return readStringSetting(widget.settings, "fieldPath") ?? "";
}

function readStringSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function measureViewportSize(viewport: HTMLDivElement): RuntimeViewportSize {
  const style = window.getComputedStyle(viewport);
  const horizontalPadding = readCssPixelValue(style.paddingLeft) + readCssPixelValue(style.paddingRight);
  const verticalPadding = readCssPixelValue(style.paddingTop) + readCssPixelValue(style.paddingBottom);
  const windowSize = getWindowViewportSize();

  return {
    height: Math.max(1, (viewport.clientHeight || windowSize.height) - verticalPadding),
    width: Math.max(1, (viewport.clientWidth || windowSize.width) - horizontalPadding),
  };
}

function getWindowViewportSize(): RuntimeViewportSize {
  if (typeof window === "undefined") {
    return { height: 1, width: 1 };
  }

  return {
    height: Math.max(1, window.innerHeight),
    width: Math.max(1, window.innerWidth),
  };
}

function readCssPixelValue(value: string): number {
  const parsedValue = Number.parseFloat(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function RuntimeComingSoonMessage({ screen }: { screen: ScreenConfig }) {
  return (
    <section className="runtime-coming-soon" aria-label="Runtime screen coming soon">
      <p className="eyebrow">Coming soon</p>
      <h3>{screen.title}</h3>
      <p>This screen exists in the application model, but it does not have runtime content yet.</p>
    </section>
  );
}

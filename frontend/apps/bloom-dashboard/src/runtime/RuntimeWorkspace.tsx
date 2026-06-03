import type { ApplicationConfig, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler, WidgetDataSnapshot } from "@bloom/widget-renderers";
import { appendTopicEchoMessage, appendTopicPlotSample, resolveCanvasFitScale } from "@bloom/widgets";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveScreenArtboardLayout, ScreenArtboard } from "../screen/ScreenArtboard";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import type {
  RuntimeActionClient,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";

const FIT_OVERFLOW_GUARD = 0.99;

type RuntimeViewportSize = {
  height: number;
  width: number;
};

type RuntimeWorkspaceProps = {
  application: ApplicationConfig;
  onActionIntent: WidgetActionIntentHandler;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onTopicSample?: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest?: (request: RuntimeTopicSubscriptionRequest) => void;
  screen: ScreenConfig;
  selection: WorkspaceSelection;
};

export function RuntimeWorkspace({
  application,
  onActionIntent,
  onSelectionChange,
  onTopicSample,
  onTopicSubscriptionRequest,
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
  const runtimeScreen = useMemo(() => scaleRuntimeScreenLayout(screen, artboardScale), [artboardScale, screen]);
  const [dataByWidgetId, setDataByWidgetId] = useState<Record<string, WidgetDataSnapshot>>({});
  const previousScreenIdRef = useRef(screen.id);

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
    <section className="runtime-app-workspace" aria-label="Runtime application">
      <header className="runtime-app-topbar">
        <div>
          <p className="eyebrow">Runtime app</p>
          <h2>{application.name}</h2>
        </div>

        {application.screens.length > 1 ? (
          <div aria-label="Runtime screens" className="runtime-screen-tabs" role="tablist">
            {application.screens.map((availableScreen) => (
              <button
                aria-current={screen.id === availableScreen.id ? "page" : undefined}
                aria-selected={screen.id === availableScreen.id}
                className="runtime-screen-tab"
                key={availableScreen.id}
                onClick={() =>
                  onSelectionChange({
                    ...selection,
                    screenId: availableScreen.id,
                  })
                }
                role="tab"
                type="button"
              >
                <strong>{availableScreen.title}</strong>
                <span>{availableScreen.widgets.length} widgets</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

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
              rendererOptions={{ dataByWidgetId, onActionIntent }}
              screen={runtimeScreen}
              style={{
                height: `${scaledArtboardSize.height}px`,
                width: `${scaledArtboardSize.width}px`,
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
    if (widget.kind !== "topic-echo" && widget.kind !== "topic-plot") {
      return [];
    }

    const topic = readStringSetting(widget.settings, "topic");
    if (!topic?.startsWith("/")) {
      return [];
    }

    return [
      {
        type: "subscribe_topic",
        topic,
        message_type: readStringSetting(widget.settings, "messageType") ?? "",
        field_path: readStringSetting(widget.settings, "fieldPath") ?? "",
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
    if (readStringSetting(widget.settings, "topic") !== sample.payload.topic) {
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
  }

  return nextData ?? { ...currentData };
}

function readStringSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function scaleRuntimeScreenLayout(screen: ScreenConfig, scale: number): ScreenConfig {
  if (scale === 1) {
    return screen;
  }

  return {
    ...screen,
    widgets: screen.widgets.map((widget) => scaleWidgetLayout(widget, scale)),
  };
}

function scaleWidgetLayout(widget: WidgetConfig, scale: number): WidgetConfig {
  return {
    ...widget,
    layout: {
      height: Math.max(1, Math.round(widget.layout.height * scale)),
      width: Math.max(1, Math.round(widget.layout.width * scale)),
      x: Math.round(widget.layout.x * scale),
      y: Math.round(widget.layout.y * scale),
    },
  };
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

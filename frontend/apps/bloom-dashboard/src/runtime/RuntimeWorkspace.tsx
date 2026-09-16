import type {
  ApplicationConfig,
  RosTopicStatus,
  RuntimeCapabilityReport,
  ScreenConfig,
  WidgetConfig,
} from "@bloom/api-client";
import type { WidgetActionIntentHandler, WidgetDataSnapshot } from "@bloom/widget-renderers";
import { appendTopicEchoMessage, appendTopicPlotSample } from "@bloom/widgets";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveScreenArtboardLayout, ScreenArtboard } from "../screen/ScreenArtboard";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { BloomDebugPanel } from "./BloomDebugPanel";
import { RuntimeGuidedTour } from "./RuntimeGuidedTour";
import { RuntimeKioskBar } from "./RuntimeKioskBar";
import { RuntimeRobotStatusPanel } from "./RuntimeRobotStatusPanel";
import { RuntimeSettingsPanel } from "./RuntimeSettingsPanel";
import { RuntimeStopControl } from "./RuntimeStopControl";
import type {
  RuntimeActionClient,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";
import { resolveRuntimeCanvasFit } from "./runtime-canvas-fit";
import { type RuntimeProfileOverrides, runtimeProfileOverrideKey } from "./runtime-profile-overrides";
import { resolveRuntimeStatusChip } from "./runtime-status-chip";
import { createRuntimeControlStateByWidgetId, type RuntimeModeState } from "./runtimeModeState";
import { resolveRuntimeProfile } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import type { ComponentContribution } from "./teleop-composition";
import { useAudioCues } from "./use-audio-cues";
import { useDwellActivation } from "./use-dwell-activation";
import { GAMEPAD_CONTRIBUTION_ID, useGamepadInput } from "./use-gamepad-input";
import { usePositionLibrary } from "./use-position-library";
import type { RuntimeActionFeedback } from "./use-runtime-action-dispatcher";
import { useRuntimeLinkState } from "./use-runtime-link-state";
import { useRuntimeStop } from "./use-runtime-stop";
import { useSwitchScanning } from "./use-switch-scanning";

type RuntimeViewportSize = {
  height: number;
  width: number;
};

type ApplicationRuntimeContext = Pick<ApplicationConfig, "action_presets" | "runtime_policy"> & {
  allowedCommandFrameIds?: readonly string[];
  appId: string;
  configId: string;
  onCommandFrameChange?: (frameId: string) => void;
};

type RuntimeWorkspaceProps = {
  /** Feeds a non-widget input source into the composed twist. */
  onTeleopContribution?: (
    sourceId: string,
    contribution: ComponentContribution | null,
    commandFrameId?: string,
  ) => void;
  runtimeCapabilityReport: RuntimeCapabilityReport | null;
  teleopActive: boolean;
  application: ApplicationConfig;
  onBackToRuntimeHome: () => void;
  onActionIntent: (
    intent: Parameters<WidgetActionIntentHandler>[0],
    runtimeContext?: ApplicationRuntimeContext,
  ) => ReturnType<WidgetActionIntentHandler>;
  onEditApplication: () => void;
  onEditScreen: () => void;
  onOpenBuilderHome: () => void;
  onOpenHelp: () => void;
  onOpenLanding: () => void;
  onOpenSupervisor: () => void;
  onProfileOverridesChange: (profileId: string, overrides: RuntimeProfileOverrides) => void;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onSuspendTeleop: () => void;
  onTopicSample?: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest?: (request: RuntimeTopicSubscriptionRequest) => void;
  preferredProfileId?: string;
  profileOverrides: Readonly<Record<string, RuntimeProfileOverrides>>;
  runtimeActionClient: RuntimeActionClient;
  runtimeActionFeedback: RuntimeActionFeedback | null;
  runtimeModeState: RuntimeModeState;
  screen: ScreenConfig;
  selection: WorkspaceSelection;
};

export function RuntimeWorkspace({
  runtimeCapabilityReport,
  teleopActive,
  application,
  onBackToRuntimeHome,
  onActionIntent,
  onEditApplication,
  onEditScreen,
  onOpenHelp,
  onOpenLanding,
  onOpenSupervisor,
  onProfileOverridesChange,
  onSelectionChange,
  onSuspendTeleop,
  onTeleopContribution,
  onTopicSample,
  onTopicSubscriptionRequest,
  preferredProfileId = "",
  profileOverrides,
  runtimeActionClient,
  runtimeActionFeedback,
  runtimeModeState,
  screen,
  selection,
}: RuntimeWorkspaceProps) {
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const runtimeControlsRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [viewportSize, setViewportSize] = useState<RuntimeViewportSize>(() => getWindowViewportSize());
  const { artboardSize } = resolveScreenArtboardLayout(screen);
  const canvasFit = useMemo(
    () => resolveRuntimeCanvasFit(screen.canvas, artboardSize, viewportSize),
    [artboardSize, screen.canvas, viewportSize],
  );
  const artboardScale = canvasFit.scale;
  const scaledArtboardSize = useMemo(
    () => ({
      height: Math.max(1, Math.floor(artboardSize.height * artboardScale)),
      width: Math.max(1, Math.floor(artboardSize.width * artboardScale)),
    }),
    [artboardScale, artboardSize],
  );
  const baseRuntimeProfile = useMemo(
    () => resolveRuntimeProfile(application, viewportSize, preferredProfileId),
    [application, preferredProfileId, viewportSize],
  );
  const profileOverrideKey = runtimeProfileOverrideKey(selection, baseRuntimeProfile.id);
  const activeProfileOverrides = profileOverrides[profileOverrideKey] ?? EMPTY_PROFILE_OVERRIDES;
  const runtimeProfile = useMemo(
    () => resolveRuntimeProfile(application, viewportSize, preferredProfileId, activeProfileOverrides),
    [activeProfileOverrides, application, preferredProfileId, viewportSize],
  );
  const strings = useRuntimeStrings(runtimeProfile.language);
  const configuredCommandFrameId =
    application.runtime_policy.command_frame_id || runtimeCapabilityReport?.command_frame_id || null;
  const defaultCommandFrameId = resolvePreferredCommandFrameId(
    activeProfileOverrides.commandFrameId,
    configuredCommandFrameId,
    runtimeCapabilityReport?.command_frame_ids ?? null,
  );
  const [commandFrameId, setCommandFrameId] = useState<string | null>(defaultCommandFrameId);
  const [topicStatuses, setTopicStatuses] = useState<readonly RosTopicStatus[] | null | undefined>(() =>
    runtimeActionClient.listRosTopicStatus ? null : undefined,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new app starts a new frame-selection session.
  useEffect(() => {
    setCommandFrameId(defaultCommandFrameId);
  }, [application.id, baseRuntimeProfile.id, defaultCommandFrameId]);
  const controlStateByWidgetId = useMemo(
    () =>
      createRuntimeControlStateByWidgetId(screen, runtimeModeState, {
        activeCommandFrameId: commandFrameId,
        allowedCommandFrameIds: runtimeCapabilityReport?.command_frame_ids ?? null,
        runtimeCapabilities: runtimeCapabilityReport?.capabilities ?? null,
        teleopActive,
        topicStatuses,
      }),
    [
      commandFrameId,
      runtimeCapabilityReport?.capabilities,
      runtimeCapabilityReport?.command_frame_ids,
      runtimeModeState,
      screen,
      teleopActive,
      topicStatuses,
    ],
  );
  const [dataByWidgetId, setDataByWidgetId] = useState<Record<string, WidgetDataSnapshot>>({});
  const screenHasPositionLibrary = screen.widgets.some((widget) => widget.kind === "position-library");
  const positionLibrary = usePositionLibrary(runtimeActionClient, screenHasPositionLibrary);
  const effectiveDataByWidgetId = useMemo(() => {
    if (!screenHasPositionLibrary) {
      return dataByWidgetId;
    }
    const merged: Record<string, WidgetDataSnapshot> = { ...dataByWidgetId };
    for (const widget of screen.widgets) {
      if (widget.kind !== "position-library") {
        continue;
      }
      const existing = merged[widget.id];
      merged[widget.id] = {
        type: "position-library",
        joints: existing?.type === "position-library" ? existing.joints : undefined,
        saved: positionLibrary.state.saved.map((pose) => ({
          name: pose.name,
          jointNames: pose.joint_names,
          positions: pose.positions,
          description: pose.description,
        })),
        exportYaml: positionLibrary.state.exportYaml || undefined,
        notice: positionLibrary.state.notice || undefined,
        busy: positionLibrary.state.busy,
      };
    }
    return merged;
  }, [dataByWidgetId, positionLibrary.state, screen.widgets, screenHasPositionLibrary]);
  const runtimeStop = useRuntimeStop(runtimeActionClient);
  const runtimeLink = useRuntimeLinkState(runtimeActionClient);
  const stopped = runtimeStop.state?.stopped === true;
  const gamepad = useGamepadInput({
    deadzone: runtimeProfile.deadzone > 0 ? runtimeProfile.deadzone : undefined,
    enabled: onTeleopContribution !== undefined && !maintenanceOpen && !settingsOpen && !tourOpen && !stopped,
    onContribution: (contribution) =>
      onTeleopContribution?.(GAMEPAD_CONTRIBUTION_ID, contribution, commandFrameId ?? ""),
  });
  const statusChip = resolveRuntimeStatusChip(runtimeStop.state, runtimeLink, strings);
  useAudioCues(statusChip?.tone, runtimeProfile.audioCues);
  const scanning = useSwitchScanning({
    enabled: runtimeProfile.motorAccessibilityPreset === "scan" && !settingsOpen && !tourOpen && !stopped,
    periodMs: runtimeProfile.scanPeriodMs,
    rootRef: runtimeControlsRef,
    revision: `${screen.id}:${runtimeProfile.motorAccessibilityPreset}`,
  });
  useDwellActivation({
    activateTarget: (target) => {
      if (target.dataset.dwellAction === "resume") {
        runtimeStop.resume();
        return;
      }
      target.click();
    },
    dwellMs: runtimeProfile.dwellMs,
    enabled: runtimeProfile.dwellEnabled && !settingsOpen && !tourOpen,
    isTargetEnabled: (target) => !stopped || target.dataset.dwellAction === "resume",
    rootRef: runtimeControlsRef,
  });
  const previousScreenIdRef = useRef(screen.id);
  const handleRuntimeActionIntent: WidgetActionIntentHandler = (intent) => {
    if (controlStateByWidgetId[intent.widgetId]?.unavailable) {
      return { accepted: false, detail: controlStateByWidgetId[intent.widgetId]?.disabledReason };
    }
    // Position ops are runtime-shell HTTP work, not robot commands.
    if (positionLibrary.handleIntent(intent)) {
      return { accepted: true };
    }
    return onActionIntent(intent, {
      action_presets: application.action_presets,
      allowedCommandFrameIds: runtimeCapabilityReport?.command_frame_ids,
      appId: selection.appId,
      configId: selection.configId,
      onCommandFrameChange: setCommandFrameId,
      runtime_policy: {
        ...application.runtime_policy,
        command_frame_id: commandFrameId ?? "",
      },
    });
  };

  useEffect(() => {
    if (settingsOpen || tourOpen) {
      return;
    }
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
  }, [settingsOpen, tourOpen]);

  useEffect(() => {
    const listRosTopicStatus = runtimeActionClient.listRosTopicStatus;
    if (!listRosTopicStatus) {
      setTopicStatuses(undefined);
      return;
    }

    let cancelled = false;
    setTopicStatuses(null);
    const refresh = () => {
      listRosTopicStatus()
        .then((nextStatuses) => {
          if (!cancelled) {
            setTopicStatuses(nextStatuses);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTopicStatuses(null);
          }
        });
    };

    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runtimeActionClient.listRosTopicStatus]);

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
    onSuspendTeleop();
    setDataByWidgetId({});
  }, [onSuspendTeleop, screen.id]);

  useEffect(() => {
    if (settingsOpen || tourOpen) {
      onSuspendTeleop();
    }
  }, [onSuspendTeleop, settingsOpen, tourOpen]);

  useEffect(() => {
    if (stopped) {
      onSuspendTeleop();
    }
  }, [onSuspendTeleop, stopped]);

  useEffect(() => {
    if (!onTopicSample) {
      return;
    }

    return onTopicSample((sample) => {
      setDataByWidgetId((currentData) => appendRuntimeTopicSample(currentData, screen, sample));
    });
  }, [onTopicSample, screen]);

  if (settingsOpen) {
    return (
      <section
        aria-label={strings.workspace.application}
        className="runtime-app-workspace"
        data-display-preset={runtimeProfile.displayPreset}
        data-has-debug="false"
        data-motor-accessibility-preset={runtimeProfile.motorAccessibilityPreset}
        data-runtime-layout="operator"
        data-runtime-scanning="false"
        data-runtime-stopped={stopped ? "true" : "false"}
        style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
      >
        <RuntimeSettingsPanel
          allowedCommandFrameIds={runtimeCapabilityReport?.command_frame_ids ?? null}
          baseCommandFrameId={commandFrameId ?? configuredCommandFrameId}
          baseProfile={baseRuntimeProfile}
          key={profileOverrideKey}
          onChange={(nextOverrides) => onProfileOverridesChange(baseRuntimeProfile.id, nextOverrides)}
          onDone={() => setSettingsOpen(false)}
          onOpenTour={() => {
            setSettingsOpen(false);
            setTourOpen(true);
          }}
          overrides={activeProfileOverrides}
          teleopActive={teleopActive}
        />
      </section>
    );
  }

  if (tourOpen) {
    return (
      <section
        aria-label={strings.workspace.application}
        className="runtime-app-workspace"
        data-display-preset={runtimeProfile.displayPreset}
        data-has-debug="false"
        data-motor-accessibility-preset={runtimeProfile.motorAccessibilityPreset}
        data-runtime-layout="operator"
        data-runtime-scanning="false"
        data-runtime-stopped="false"
        style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
      >
        <RuntimeGuidedTour
          application={application}
          onDone={() => setTourOpen(false)}
          profile={runtimeProfile}
          screen={screen}
          selection={selection}
        />
      </section>
    );
  }

  return (
    <section
      aria-label={strings.workspace.application}
      className="runtime-app-workspace"
      data-display-preset={runtimeProfile.displayPreset}
      data-has-debug={application.id === "bloom-debug" ? "true" : "false"}
      data-motor-accessibility-preset={runtimeProfile.motorAccessibilityPreset}
      data-runtime-layout="operator"
      data-runtime-scanning={scanning.index >= 0 ? "true" : "false"}
      data-runtime-stopped={stopped ? "true" : "false"}
      style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
    >
      <RuntimeKioskBar
        application={application}
        commandFeedback={runtimeActionFeedback?.appId === application.id ? runtimeActionFeedback : null}
        commandFrameId={commandFrameId}
        gamepadName={gamepad.connected ? gamepad.id : null}
        robotName={runtimeCapabilityReport?.robot_name ?? null}
        diagnostics={
          <RuntimeRobotStatusPanel
            application={application}
            client={runtimeActionClient}
            modeState={runtimeModeState}
            sessionStatus={runtimeActionClient.sendTeleopCommand ? "live" : "local"}
            strings={strings.supervisor.status}
          />
        }
        fitWarning={canvasFit.warning}
        onEditApplication={onEditApplication}
        onEditScreen={onEditScreen}
        onOpenAppLibrary={onBackToRuntimeHome}
        onOpenHelp={onOpenHelp}
        onOpenLanding={onOpenLanding}
        onMaintenanceOpenChange={setMaintenanceOpen}
        onOpenSupervisor={onOpenSupervisor}
        language={runtimeProfile.language}
        onLanguageChange={(language) =>
          onProfileOverridesChange(baseRuntimeProfile.id, { ...activeProfileOverrides, language })
        }
        onOpenSettings={() => {
          onSuspendTeleop();
          setSettingsOpen(true);
        }}
        onOpenTour={() => {
          onSuspendTeleop();
          setTourOpen(true);
        }}
        onSelectScreen={(screenId) => {
          onSuspendTeleop();
          onSelectionChange({ ...selection, screenId });
        }}
        onSuspendTeleop={onSuspendTeleop}
        profileName={runtimeProfile.name}
        screen={screen}
        statusChip={statusChip}
      />

      {application.id === "bloom-debug" ? <BloomDebugPanel client={runtimeActionClient} /> : null}

      <div className="runtime-app-canvas-shell" ref={runtimeControlsRef}>
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
              renderEmptyState={(emptyScreen) => <RuntimeComingSoonMessage screen={emptyScreen} strings={strings} />}
              rendererOptions={{
                conditioning: {
                  deadzone: runtimeProfile.deadzone,
                  repeatGuardMs: runtimeProfile.repeatGuardMs,
                },
                controlStateByWidgetId,
                dataByWidgetId: effectiveDataByWidgetId,
                motorPreset: runtimeProfile.motorAccessibilityPreset,
                onActionIntent: handleRuntimeActionIntent,
              }}
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

        {scanning.index >= 0 ? (
          <div className="runtime-switch-bar">
            <button
              className="runtime-switch-bar-button"
              data-scan-switch=""
              onClick={scanning.activateCurrent}
              type="button"
            >
              {strings.scan.button}
            </button>
            <p aria-live="polite" className="sr-only" role="status">
              {strings.scan.progress(scanning.index + 1, scanning.targetCount)}
            </p>
          </div>
        ) : null}

        {runtimeActionClient.engageRuntimeStop ? (
          <RuntimeStopControl
            onEngage={runtimeStop.engage}
            onResume={runtimeStop.resume}
            requestError={runtimeStop.requestError}
            stopped={runtimeStop.state?.stopped ?? null}
            language={runtimeProfile.language}
          />
        ) : null}
      </div>
    </section>
  );
}

const EMPTY_PROFILE_OVERRIDES: RuntimeProfileOverrides = {};

function resolvePreferredCommandFrameId(
  preferredFrameId: string | undefined,
  fallbackFrameId: string | null,
  allowedFrameIds: readonly string[] | null,
): string | null {
  if (preferredFrameId && (!allowedFrameIds || allowedFrameIds.includes(preferredFrameId))) {
    return preferredFrameId;
  }
  return fallbackFrameId;
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

    if (widget.kind === "position-library") {
      const joints = readJointStateSample(topicMessage.value, readJointNamesSetting(widget.settings));
      if (joints) {
        nextData = nextData ?? { ...currentData };
        const existing = currentData[widget.id];
        nextData[widget.id] = {
          ...(existing?.type === "position-library" ? existing : { type: "position-library", saved: [] }),
          type: "position-library",
          joints: { ...joints, receivedAt: topicMessage.receivedAt },
        };
      }
    }
  }

  return nextData ?? { ...currentData };
}

/**
 * Exported so the builder's destination panel can be tested against the real
 * subscription rule instead of a copy of it. See `widget-destination.ts`.
 */
export function resolveWidgetRuntimeTopic(widget: WidgetConfig): string | undefined {
  if (widget.kind === "robot-3d" || widget.kind === "position-library") {
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
  if (widget.kind === "robot-3d" || widget.kind === "position-library") {
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

function readJointNamesSetting(settings: Record<string, unknown>): string[] {
  const raw = settings.jointNames;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

function readJointStateSample(value: unknown, orderedNames: string[]): { names: string[]; positions: number[] } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const names = Array.isArray(record.name) ? record.name.map(String) : [];
  const positions = Array.isArray(record.position) ? record.position.map(Number) : [];
  if (names.length === 0 || names.length !== positions.length) {
    return null;
  }
  if (orderedNames.length === 0) {
    return { names, positions };
  }
  // Filter and order to the configured joints; a sample missing one is
  // incomplete and must not be capturable.
  const lookup = new Map(names.map((name, index) => [name, positions[index] as number]));
  const ordered: number[] = [];
  for (const name of orderedNames) {
    const position = lookup.get(name);
    if (position === undefined || !Number.isFinite(position)) {
      return null;
    }
    ordered.push(position);
  }
  return { names: orderedNames, positions: ordered };
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

function RuntimeComingSoonMessage({ screen, strings }: { screen: ScreenConfig; strings: RuntimeStrings }) {
  return (
    <section className="runtime-coming-soon" aria-label={strings.workspace.comingSoonRegion}>
      <p className="eyebrow">{strings.workspace.comingSoon}</p>
      <h3>{screen.title}</h3>
      <p>{strings.workspace.comingSoonDescription}</p>
    </section>
  );
}

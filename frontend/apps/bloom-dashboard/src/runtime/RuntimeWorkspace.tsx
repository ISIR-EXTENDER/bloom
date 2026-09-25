import type { ApplicationConfig, RuntimeCapabilityReport, ScreenConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler } from "@bloom/widget-renderers";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { getBloomApiBaseUrl, getBloomApiKey } from "../configurations/configuration-client";
import { ScreenArtboard } from "../screen/ScreenArtboard";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import {
  dismissGuidedTourOffer,
  guidedTourProgressKey,
  isGuidedTourOfferDismissed,
  loadGuidedTourProgress,
} from "../ui/guided-tour-progress";
import { BloomDebugPanel } from "./BloomDebugPanel";
import { resolveCameraStreamTargets, useCameraStreams } from "./camera-stream";
import { applyPlotSelections, usePlotSelections } from "./plot-series-data";
import { RuntimeGuidedTour } from "./RuntimeGuidedTour";
import { RuntimeKioskBar, resolveRuntimeRole } from "./RuntimeKioskBar";
import { RuntimeRobotStatusPanel } from "./RuntimeRobotStatusPanel";
import { RuntimeSettingsPanel } from "./RuntimeSettingsPanel";
import { RuntimeStopControl } from "./RuntimeStopControl";
import { createRobotModelSource } from "./robot-model-source";
import type { RuntimeActionClient, RuntimeTopicSubscriptionRequest } from "./runtime-action-dispatcher";
import { isFullPanelScreen, resolveRuntimeArtboardSize, resolveRuntimeCanvasFit } from "./runtime-canvas-fit";
import { isRuntimeMotionHeld, resolveRuntimeIntentRefusal } from "./runtime-intent-gate";
import { type RuntimeProfileOverrides, runtimeProfileOverrideKey } from "./runtime-profile-overrides";
import type { RuntimeTeleopCommandRequest } from "./runtime-protocol";
import { resolveRuntimeStatusChip } from "./runtime-status-chip";
import { withRobotCommand } from "./runtime-topic-data";
import { createRuntimeControlStateByWidgetId, type RuntimeModeState, usesTeleopAdapter } from "./runtimeModeState";
import { resolveNavigableScreens, resolveRuntimeProfile } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import type { ComponentContribution } from "./teleop-composition";
import { useAudioCues } from "./use-audio-cues";
import { useDwellActivation } from "./use-dwell-activation";
import { GAMEPAD_CONTRIBUTION_ID, useGamepadInput } from "./use-gamepad-input";
import { useParameterReadings } from "./use-parameter-readings";
import { usePositionLibrary } from "./use-position-library";
import { findRuntimeRegion, findStopRegion, type RegionRect, useReservedRegionRect } from "./use-reserved-region-rect";
import type { RuntimeActionFeedback } from "./use-runtime-action-dispatcher";
import { useRuntimeControl } from "./use-runtime-control";
import { useRuntimeLinkState } from "./use-runtime-link-state";
import { useRuntimeStop } from "./use-runtime-stop";
import { useRuntimeTopicData } from "./use-runtime-topic-data";
import { useViewportSize } from "./use-runtime-viewport";
import { useStoppedControls } from "./use-stopped-controls";
import { useSwitchScanning } from "./use-switch-scanning";
import { useTopicStatuses } from "./use-topic-statuses";

type ApplicationRuntimeContext = Pick<ApplicationConfig, "action_presets" | "runtime_policy"> & {
  allowedCommandFrameIds?: readonly string[];
  appId: string;
  configId: string;
  onCommandFrameChange?: (frameId: string) => void;
};

type RuntimeWorkspaceProps = {
  /** Feeds a non-widget input source into the composed twist. */
  /** Subscribes to each twist the runtime sends, for the widgets that draw the commanded motion. */
  onTeleopCommand?: (listener: (request: RuntimeTeleopCommandRequest) => void) => () => void;
  onTeleopContribution?: (
    sourceId: string,
    contribution: ComponentContribution | null,
    commandFrameId?: string,
  ) => void;
  runtimeCapabilityReport: RuntimeCapabilityReport | null;
  teleopActive: boolean;
  /** Advances when teleop is neutralized, so held controls return to rest. */
  teleopNeutralRevision?: number;
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
  /** Switching role from maintenance; the workspace opens that profile's layout. */
  onProfileChange?: (profileId: string) => void;
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
  teleopNeutralRevision,
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
  onTeleopCommand,
  onTeleopContribution,
  onTopicSample,
  onTopicSubscriptionRequest,
  onProfileChange,
  preferredProfileId = "",
  profileOverrides,
  runtimeActionClient,
  runtimeActionFeedback,
  runtimeModeState,
  screen,
  selection,
}: RuntimeWorkspaceProps) {
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const artboardFrameRef = useRef<HTMLDivElement | null>(null);
  const runtimeControlsRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // Offered once per app on this device: the tour was only reachable behind the maintenance hold,
  // so a first-time operator had to find a hold gesture to learn the hold gesture.
  const tourKey = guidedTourProgressKey("runtime", selection.configId, selection.appId);
  const [tourOfferAnswered, setTourOfferAnswered] = useState(true);
  useEffect(() => {
    setTourOfferAnswered(isGuidedTourOfferDismissed(tourKey) || loadGuidedTourProgress(tourKey).length > 0);
  }, [tourKey]);
  const answerTourOffer = () => {
    dismissGuidedTourOffer(tourKey);
    setTourOfferAnswered(true);
  };
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  // Read synchronously by the intent gate: a held control's next tick must not beat the re-render that holds it.
  const motionHeldRef = useRef(false);
  const motionHeld = isRuntimeMotionHeld({ maintenanceOpen, settingsOpen, tourOpen });
  const viewportSize = useViewportSize(canvasViewportRef, !settingsOpen && !tourOpen);
  const fullPanel = isFullPanelScreen(screen);
  const artboardSize = useMemo(() => resolveRuntimeArtboardSize(screen), [screen]);
  const canvasFit = useMemo(
    () => resolveRuntimeCanvasFit(screen.canvas, artboardSize, viewportSize, fullPanel),
    [artboardSize, fullPanel, screen.canvas, viewportSize],
  );
  const artboardScale = canvasFit.scale;
  const stopRegion = useMemo(() => findStopRegion(screen), [screen]);
  const stopRect = useReservedRegionRect(stopRegion, artboardFrameRef, runtimeControlsRef, artboardScale);
  const debugRegion = useMemo(() => findRuntimeRegion(screen, "debug-status"), [screen]);
  const debugRect = useReservedRegionRect(debugRegion, artboardFrameRef, runtimeControlsRef, artboardScale);
  // The sheet keeps clear of STOP, which stays live above the scrim; the corner STOP is 176 px plus its margin.
  const stopFallbackInset = runtimeActionClient.engageRuntimeStop ? 202 : 0;
  const [stopSheetInset, setStopSheetInset] = useState(stopFallbackInset);
  // Measured after layout, not during render: reading the shell mid-render made the first one take the fallback.
  useLayoutEffect(() => {
    const shell = runtimeControlsRef.current;
    const next =
      stopRect && shell
        ? Math.max(0, window.innerWidth - (shell.getBoundingClientRect().left + stopRect.left) + 14)
        : stopFallbackInset;
    setStopSheetInset((current) => (current === next ? current : next));
  });
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
  const navigableApplication = useMemo(
    () => ({ ...application, screens: resolveNavigableScreens(application, baseRuntimeProfile.id) }),
    [application, baseRuntimeProfile.id],
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
  const allowedCommandFrameIds = runtimeCapabilityReport?.command_frame_ids ?? null;
  const defaultCommandFrameId = configuredCommandFrameId;
  const [commandFrameId, setCommandFrameId] = useState<string | null>(defaultCommandFrameId);
  const commandFrameUnavailable = Boolean(
    commandFrameId && allowedCommandFrameIds !== null && !allowedCommandFrameIds.includes(commandFrameId),
  );
  const commandFrameError =
    commandFrameUnavailable && commandFrameId ? strings.kiosk.frameNotOnRobot(commandFrameId) : null;
  const topicStatuses = useTopicStatuses(runtimeActionClient.listRosTopicStatus);
  const conditioning = useMemo(
    () => ({ deadzone: runtimeProfile.deadzone, repeatGuardMs: runtimeProfile.repeatGuardMs }),
    [runtimeProfile.deadzone, runtimeProfile.repeatGuardMs],
  );
  const robotModel = useMemo(() => createRobotModelSource(runtimeActionClient), [runtimeActionClient]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new app starts a new frame-selection session.
  useEffect(() => {
    setCommandFrameId(defaultCommandFrameId);
  }, [application.id, baseRuntimeProfile.id, defaultCommandFrameId]);
  // The socket knows only the deployment policy until it is told which app it runs. Its answer is where a
  // joystick may publish for this app, which the control states need to mark a refused one before it is pressed.
  const [effectiveTeleopTargets, setEffectiveTeleopTargets] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let current = true;
    setEffectiveTeleopTargets(null);
    runtimeActionClient
      .setRuntimeAppContext?.({ app_id: selection.appId, config_id: selection.configId })
      .then((ack) => {
        if (current) {
          setEffectiveTeleopTargets(ack?.payload?.allowed_teleop_targets ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [runtimeActionClient, selection.appId, selection.configId]);
  const parameterReadings = useParameterReadings(screen, runtimeActionClient);
  const baseControlStateByWidgetId = useMemo(
    () =>
      createRuntimeControlStateByWidgetId(screen, runtimeModeState, {
        activeCommandFrameId: commandFrameId,
        allowedCommandFrameIds,
        commandFrameError,
        frameReasons: {
          releaseControls: strings.kiosk.frameReleaseControls,
          unavailableOnRobot: strings.kiosk.frameUnavailableOnRobot,
        },
        runtimeCapabilities: runtimeCapabilityReport?.capabilities ?? null,
        teleopActive,
        teleopTargets: {
          app: application.runtime_policy.allowed_teleop_targets,
          effective: effectiveTeleopTargets,
          reasons: { app: strings.kiosk.teleopTargetNotInApp, server: strings.kiosk.teleopTargetRefusedByServer },
        },
        topicStatuses,
      }),
    [
      application.runtime_policy.allowed_teleop_targets,
      commandFrameId,
      commandFrameError,
      effectiveTeleopTargets,
      allowedCommandFrameIds,
      runtimeCapabilityReport?.capabilities,
      runtimeModeState,
      screen,
      strings,
      teleopActive,
      topicStatuses,
    ],
  );
  const controlStateByWidgetId = useMemo(() => {
    const merged = { ...baseControlStateByWidgetId };
    for (const [widgetId, value] of Object.entries(parameterReadings)) {
      merged[widgetId] = { ...merged[widgetId], value };
    }
    return merged;
  }, [baseControlStateByWidgetId, parameterReadings]);
  const runtimeLink = useRuntimeLinkState(runtimeActionClient);
  const dataByWidgetId = useRuntimeTopicData({
    onTopicSample,
    onTopicSubscriptionRequest,
    runtimeActionClient,
    runtimeLink,
    screen,
  });
  const screenHasPositionLibrary = screen.widgets.some((widget) => widget.kind === "position-library");
  const positionLibrary = usePositionLibrary(runtimeActionClient, screenHasPositionLibrary, {
    appId: selection.appId,
    configId: selection.configId,
  });
  const plotSelections = usePlotSelections(screen, profileOverrideKey);
  // Camera frames arrive on their own socket, never on the one the operator steers by.
  const cameraTargets = useMemo(() => resolveCameraStreamTargets(screen), [screen]);
  const cameraFrames = useCameraStreams(cameraTargets, getBloomApiBaseUrl(), getBloomApiKey());
  const screenHasRobotView = screen.widgets.some((widget) => widget.kind === "robot-3d");
  const [commandTwist, setCommandTwist] = useState<RuntimeTeleopCommandRequest | null>(null);
  useEffect(() => {
    if (!screenHasRobotView || !onTeleopCommand) {
      return;
    }
    return onTeleopCommand(setCommandTwist);
  }, [onTeleopCommand, screenHasRobotView]);
  useEffect(() => {
    if (!teleopActive) {
      setCommandTwist(null);
    }
  }, [teleopActive]);
  const effectiveDataByWidgetId = useMemo(() => {
    const merged = withRobotCommand(
      { ...applyPlotSelections(screen, dataByWidgetId, plotSelections.selections), ...cameraFrames },
      screen,
      commandTwist,
    );
    if (!screenHasPositionLibrary) {
      return merged;
    }
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
  }, [
    cameraFrames,
    commandTwist,
    dataByWidgetId,
    plotSelections.selections,
    positionLibrary.state,
    screen,
    screenHasPositionLibrary,
  ]);
  const runtimeStop = useRuntimeStop(runtimeActionClient);
  const runtimeControl = useRuntimeControl(runtimeActionClient, onSuspendTeleop);
  const ownsRuntimeControl = !runtimeControl.supported || runtimeControl.state?.is_owner === true;
  const runtimeControlBlocked = runtimeControl.supported && !ownsRuntimeControl;
  const stopped = runtimeStop.state?.stopped === true;
  const isAssistiveRuntimeTargetEnabled = (target: HTMLElement) => {
    if (runtimeControlBlocked) {
      return target.hasAttribute("data-runtime-control-independent");
    }
    // Stopped: resume, and the way out. Maintenance holds motion anyway, so a
    // switch or dwell operator is not locked on the screen they stopped on.
    return !stopped || target.dataset.dwellAction === "resume" || target.hasAttribute("data-assistive-maintenance");
  };
  const gamepad = useGamepadInput({
    deadzone: runtimeProfile.deadzone > 0 ? runtimeProfile.deadzone : undefined,
    enabled:
      onTeleopContribution !== undefined &&
      !commandFrameUnavailable &&
      ownsRuntimeControl &&
      !maintenanceOpen &&
      !settingsOpen &&
      !tourOpen &&
      !stopped,
    onContribution: (contribution) =>
      onTeleopContribution?.(GAMEPAD_CONTRIBUTION_ID, contribution, commandFrameId ?? ""),
  });
  const resolvedChip = resolveRuntimeStatusChip(runtimeStop.state, runtimeLink, strings, {
    heldForMaintenance: motionHeld,
    notInControl: runtimeControlBlocked,
  });
  // Bloom Debug says what it is where an operator app says READY; every warning still outranks it.
  const statusChip =
    application.id === "bloom-debug" && resolvedChip?.tone === "ready"
      ? { label: strings.status.debug, tone: "debug" as const }
      : resolvedChip;
  useAudioCues(statusChip?.tone, runtimeProfile.audioCues);
  const scanning = useSwitchScanning({
    // Maintenance covers the canvas; a switch press there must not reach it.
    // Scanning stays on while stopped: isTargetEnabled leaves resume as the
    // only target, and turning it off would latch a switch operator out.
    enabled: runtimeProfile.motorAccessibilityPreset === "scan" && !maintenanceOpen && !settingsOpen && !tourOpen,
    isTargetEnabled: isAssistiveRuntimeTargetEnabled,
    periodMs: runtimeProfile.scanPeriodMs,
    // The whole view, not just the canvas: the bar's maintenance button is the
    // only way to Settings, another screen, another role, or out.
    rootRef: workspaceRef,
    revision: `${screen.id}:${runtimeProfile.motorAccessibilityPreset}:${runtimeControlBlocked}:${stopped}`,
  });
  useStoppedControls(canvasViewportRef, stopped);
  useDwellActivation({
    dwellMs: runtimeProfile.dwellMs,
    enabled: runtimeProfile.dwellEnabled && !maintenanceOpen && !settingsOpen && !tourOpen,
    isTargetEnabled: isAssistiveRuntimeTargetEnabled,
    // The whole view, as scanning uses: a dwell operator needs the bar's maintenance button too.
    rootRef: workspaceRef,
  });
  const previousScreenIdRef = useRef(screen.id);
  motionHeldRef.current = motionHeld;
  const holdMotion = () => {
    motionHeldRef.current = true;
    onSuspendTeleop();
  };
  const handleRuntimeActionIntent: WidgetActionIntentHandler = (intent) => {
    // Choosing what a plot shows is view state: no ownership needed, nothing reaches the robot.
    if (intent.type === "plot-series-toggle") {
      plotSelections.toggle(intent.plotId, intent.seriesKey);
      return { accepted: true };
    }
    const refusal = resolveRuntimeIntentRefusal(intent, {
      held: motionHeldRef.current,
      ownsControl: ownsRuntimeControl,
      stopped,
      unavailable: controlStateByWidgetId[intent.widgetId]?.unavailable === true,
    });
    if (refusal === "not-owner") {
      return {
        accepted: false,
        detail: runtimeControl.state?.owner_present ? strings.control.anotherOwner : strings.control.noOwner,
      };
    }
    if (refusal === "stopped") {
      return { accepted: false, detail: strings.kiosk.stoppedBadge };
    }
    if (refusal === "held") {
      return { accepted: false, detail: strings.kiosk.heldBadge };
    }
    if (refusal === "unavailable") {
      return { accepted: false, detail: controlStateByWidgetId[intent.widgetId]?.disabledReason };
    }
    // Position ops are runtime-shell HTTP work, not robot commands.
    if (positionLibrary.handleIntent(intent)) {
      return { accepted: true };
    }
    return onActionIntent(intent, {
      action_presets: application.action_presets,
      allowedCommandFrameIds: allowedCommandFrameIds ?? undefined,
      appId: selection.appId,
      configId: selection.configId,
      onCommandFrameChange: setCommandFrameId,
      runtime_policy: {
        ...application.runtime_policy,
        command_frame_id: commandFrameId ?? "",
      },
    });
  };

  // A new function identity each render would re-render every widget; the ref keeps the newest handler.
  const actionIntentRef = useRef(handleRuntimeActionIntent);
  actionIntentRef.current = handleRuntimeActionIntent;
  const stableActionIntent = useCallback<WidgetActionIntentHandler>((intent) => actionIntentRef.current(intent), []);

  // Opening an app, closing Settings or the tour, and changing screen from
  // maintenance all replace the view; focus follows it to the named region
  // instead of dropping to <body>.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new screen is a new view, and focus follows it.
  useEffect(() => {
    if (settingsOpen || tourOpen) {
      return;
    }
    workspaceRef.current?.focus({ preventScroll: true });
  }, [screen.id, settingsOpen, tourOpen]);

  useEffect(() => {
    if (previousScreenIdRef.current === screen.id) {
      return;
    }
    previousScreenIdRef.current = screen.id;
    onSuspendTeleop();
  }, [onSuspendTeleop, screen.id]);

  // An unavailable control swallows its own pointer release, so a held stick
  // would stay composed and resume streaming once the controller came back.
  const teleopControlUnavailable = screen.widgets.some(
    (widget) => usesTeleopAdapter(widget) && controlStateByWidgetId[widget.id]?.unavailable === true,
  );
  // Whatever takes the operator's hands off the controls also drops the composed twist: a sheet
  // over the canvas, STOP, a frame the robot lacks, losing control (the release zeros that arrive
  // meanwhile are refused by the gate, so a reclaim would stream a stick already let go of), or a
  // teleop control that went unavailable. Each reason re-runs this on its own, so one arriving
  // while another already holds still drops a twist composed in between; suspending twice is a no-op.
  useEffect(() => {
    if (
      settingsOpen ||
      tourOpen ||
      stopped ||
      commandFrameUnavailable ||
      runtimeControlBlocked ||
      teleopControlUnavailable
    ) {
      onSuspendTeleop();
    }
  }, [
    commandFrameUnavailable,
    onSuspendTeleop,
    runtimeControlBlocked,
    settingsOpen,
    stopped,
    teleopControlUnavailable,
    tourOpen,
  ]);

  // STOP stays live over settings and the tour: a joint-target move keeps running behind them.
  const renderStopControl = (region: RegionRect | null) =>
    runtimeActionClient.engageRuntimeStop ? (
      <RuntimeStopControl
        region={region}
        onEngage={runtimeStop.engage}
        onResume={runtimeStop.resume}
        requestError={runtimeStop.requestError}
        resumeDisabled={runtimeControlBlocked}
        resumeDisabledReason={runtimeControlBlocked ? strings.control.resumeRequiresOwner : ""}
        stopped={runtimeStop.state?.stopped ?? null}
        language={runtimeProfile.language}
      />
    ) : null;

  if (settingsOpen) {
    return (
      <section
        aria-label={strings.workspace.application}
        className="runtime-app-workspace"
        data-full-panel="true"
        data-display-preset={runtimeProfile.displayPreset}
        data-has-debug="false"
        data-motor-accessibility-preset={runtimeProfile.motorAccessibilityPreset}
        data-runtime-layout="operator"
        data-runtime-scanning="false"
        data-runtime-stopped={stopped ? "true" : "false"}
        style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
      >
        <RuntimeSettingsPanel
          applicationName={application.name}
          baseProfile={baseRuntimeProfile}
          key={profileOverrideKey}
          onClose={() => setSettingsOpen(false)}
          onSave={(nextOverrides) => onProfileOverridesChange(baseRuntimeProfile.id, nextOverrides)}
          overrides={activeProfileOverrides}
          runtimeRole={resolveRuntimeRole({
            id: baseRuntimeProfile.id,
            layoutId: profileLayoutId(application, baseRuntimeProfile.id),
          })}
        />
        {renderStopControl(null)}
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
        data-runtime-scanning={runtimeProfile.motorAccessibilityPreset === "scan" ? "true" : "false"}
        data-runtime-stopped={stopped ? "true" : "false"}
        style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
      >
        <RuntimeGuidedTour
          application={application}
          onDone={() => setTourOpen(false)}
          profile={runtimeProfile}
          screen={screen}
          selection={selection}
        />
        {renderStopControl(null)}
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
      data-full-panel={fullPanel ? "true" : undefined}
      data-runtime-control={ownsRuntimeControl ? "owned" : "blocked"}
      data-runtime-scanning={scanning.index >= 0 ? "true" : "false"}
      data-runtime-stopped={stopped ? "true" : "false"}
      ref={workspaceRef}
      style={{ "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
      tabIndex={-1}
    >
      <RuntimeKioskBar
        application={navigableApplication}
        commandFeedback={
          runtimeActionFeedback?.appId === application.id
            ? runtimeActionFeedback
            : commandFrameError
              ? { detail: commandFrameError, status: "blocked" }
              : null
        }
        commandFrameId={commandFrameId}
        ownsRobotControl={runtimeControl.supported && ownsRuntimeControl}
        gamepadName={gamepad.connected ? gamepad.id : null}
        held={stopped || motionHeld}
        link={
          runtimeLink.state === null
            ? null
            : runtimeLink.state === "connected"
              ? "connected"
              : runtimeLink.settled
                ? "down"
                : "connecting"
        }
        onSwitchProfile={onProfileChange}
        profile={{
          id: baseRuntimeProfile.id,
          layoutId: profileLayoutId(application, baseRuntimeProfile.id),
          name: runtimeProfile.name,
        }}
        profiles={application.profiles.map((candidate) => ({
          id: candidate.id,
          layoutId: candidate.preferred_control_layout_id,
          name: candidate.name,
        }))}
        publishRateHz={resolvePublishRateHz(screen)}
        publishing={teleopActive}
        scanning={{
          enabled: runtimeProfile.motorAccessibilityPreset === "scan",
          periodMs: runtimeProfile.scanPeriodMs,
        }}
        dwell={{ dwellMs: runtimeProfile.dwellMs, enabled: runtimeProfile.dwellEnabled }}
        sheetInsetRight={stopSheetInset}
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
        onMaintenanceOpenChange={(open) => {
          if (open) {
            holdMotion();
          }
          setMaintenanceOpen(open);
        }}
        onOpenSupervisor={onOpenSupervisor}
        language={runtimeProfile.language}
        onLanguageChange={(language) =>
          onProfileOverridesChange(baseRuntimeProfile.id, { ...activeProfileOverrides, language })
        }
        onOpenSettings={() => {
          holdMotion();
          setSettingsOpen(true);
        }}
        onOpenTour={() => {
          holdMotion();
          setTourOpen(true);
        }}
        tourOffer={
          tourOfferAnswered
            ? null
            : {
                onAccept: () => {
                  answerTourOffer();
                  holdMotion();
                  setTourOpen(true);
                },
                onDismiss: answerTourOffer,
              }
        }
        onSelectScreen={(screenId) => {
          onSuspendTeleop();
          onSelectionChange({ ...selection, screenId });
        }}
        onSuspendTeleop={onSuspendTeleop}
        screen={screen}
        statusChip={statusChip}
      />

      {application.id === "bloom-debug" && !debugRegion ? <BloomDebugPanel client={runtimeActionClient} /> : null}

      <div className="runtime-app-canvas-shell" ref={runtimeControlsRef}>
        {runtimeControlBlocked ? (
          <div aria-live="polite" className="runtime-control-gate" role="status">
            <strong>
              {runtimeControl.claiming
                ? strings.control.claiming
                : runtimeControl.state?.owner_present
                  ? strings.control.anotherOwner
                  : strings.control.noOwner}
            </strong>
            {runtimeControl.error ? <span>{runtimeControl.error}</span> : null}
            <button
              data-runtime-control-independent=""
              disabled={runtimeControl.claiming}
              onClick={() => void runtimeControl.claim()}
              type="button"
            >
              {runtimeControl.claiming ? strings.control.claiming : strings.control.claim}
            </button>
          </div>
        ) : null}
        <div
          className="runtime-app-canvas-viewport"
          data-runtime-mode={screen.canvas.runtime_mode}
          inert={runtimeControlBlocked || undefined}
          ref={canvasViewportRef}
        >
          <div
            className="runtime-app-artboard-frame"
            ref={artboardFrameRef}
            style={{
              height: `${scaledArtboardSize.height}px`,
              width: `${scaledArtboardSize.width}px`,
            }}
          >
            <ScreenArtboard
              className="runtime-app-artboard"
              renderEmptyState={(emptyScreen) => <RuntimeComingSoonMessage screen={emptyScreen} strings={strings} />}
              rendererOptions={{
                conditioning,
                controlStateByWidgetId,
                dataByWidgetId: effectiveDataByWidgetId,
                language: runtimeProfile.language,
                motorPreset: runtimeProfile.motorAccessibilityPreset,
                neutralRevision: teleopNeutralRevision,
                onActionIntent: stableActionIntent,
                robotModel,
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

        {scanning.index >= 0 && !stopRect ? (
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

        {debugRegion && debugRect ? (
          <BloomDebugPanel
            client={runtimeActionClient}
            region={{ left: debugRect.left, scale: artboardScale, top: debugRect.top, width: debugRegion.width }}
          />
        ) : null}

        {scanning.index >= 0 && stopRect ? (
          <>
            {renderStopControl(splitStopRegion(stopRect).stop)}
            <button
              className="runtime-switch-bar-button"
              data-placement="region"
              data-scan-switch=""
              onClick={scanning.activateCurrent}
              style={splitStopRegion(stopRect).scanSwitch}
              type="button"
            >
              {strings.scan.button}
            </button>
            <p aria-live="polite" className="sr-only" role="status">
              {strings.scan.progress(scanning.index + 1, scanning.targetCount)}
            </p>
          </>
        ) : (
          renderStopControl(stopRect)
        )}
      </div>
    </section>
  );
}

/**
 * Scanning on a full-panel screen: the switch shares the reserved STOP region instead of taking a strip
 * of canvas height, so the artboard keeps its fit and no target drops under the floor. STOP stays on
 * top, the larger half; the switch takes the rest.
 */
function splitStopRegion(region: RegionRect): { scanSwitch: RegionRect; stop: RegionRect } {
  const gap = 8;
  const stopHeight = Math.round((region.height - gap) * 0.55);
  return {
    stop: { ...region, height: stopHeight },
    scanSwitch: {
      left: region.left,
      top: region.top + stopHeight + gap,
      width: region.width,
      height: region.height - gap - stopHeight,
    },
  };
}

const EMPTY_PROFILE_OVERRIDES: RuntimeProfileOverrides = {};
const DEFAULT_PUBLISH_RATE_HZ = 30;

function profileLayoutId(application: ApplicationConfig, profileId: string): string {
  return application.profiles.find((profile) => profile.id === profileId)?.preferred_control_layout_id ?? "";
}

/** The rate the screen's teleop controls stream at; the composed twist never exceeds 30 Hz. */
function resolvePublishRateHz(screen: ScreenConfig): number {
  const rates = screen.widgets.flatMap((widget) =>
    widget.kind === "joystick" && typeof widget.settings.publish_rate_hz === "number"
      ? [widget.settings.publish_rate_hz]
      : [],
  );
  return rates.length > 0 ? Math.min(DEFAULT_PUBLISH_RATE_HZ, Math.max(...rates)) : DEFAULT_PUBLISH_RATE_HZ;
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

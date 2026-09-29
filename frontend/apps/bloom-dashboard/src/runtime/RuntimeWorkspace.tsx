import type { ApplicationConfig, RuntimeCapabilityReport, ScreenConfig } from "@bloom/api-client";
import {
  BLOOM_THEME_PRESETS,
  type BloomThemePresetId,
  createBloomThemeStyle,
  normalizeBloomThemePresetId,
} from "@bloom/ui";
import {
  INTENT_SCALING_ACTIVE_KEY,
  knownValue,
  SHARED_CONTROL_ACTIVE_KEY,
  useCommandState,
  useCommandStateConnected,
  type WidgetActionIntentHandler,
} from "@bloom/widget-renderers";
import {
  BEHAVIOUR_MARKER_PARAMETER,
  behaviourAvailability as behaviourAvailabilityOf,
  MANAGER_NODE,
  type ManagerBehaviour,
  withRobotGripper,
  withRobotGripperScreen,
} from "@bloom/widgets";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getBloomApiBaseUrl, getBloomApiKey } from "../configurations/configuration-client";
import { ScreenArtboard } from "../screen/ScreenArtboard";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import {
  dismissGuidedTourOffer,
  guidedTourOfferKey,
  isGuidedTourOfferDismissed,
  restoreGuidedTourOffer,
} from "../ui/guided-tour-progress";
import { BloomDebugPanel } from "./BloomDebugPanel";
import { resolveCameraStreamTargets, useCameraStreams } from "./camera-stream";
import { usePlotSelections } from "./plot-series-data";
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
import { createRuntimeControlStateByWidgetId, usesTeleopAdapter } from "./runtimeModeState";
import { resolveNavigableScreens, resolveRuntimeProfile, resolveRuntimeThemePresetId } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import type { ComponentContribution } from "./teleop-composition";
import { useAudioCues } from "./use-audio-cues";
import { useDwellActivation } from "./use-dwell-activation";
import { useEffectiveWidgetData } from "./use-effective-widget-data";
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
import { useStopSheetInset } from "./use-stop-sheet-inset";
import { useStoppedControls } from "./use-stopped-controls";
import { useSwitchKeyGuard, useSwitchScanning } from "./use-switch-scanning";
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
  /** Opened as a Builder preview: the bar offers the way back to the screen being edited. */
  openedFromBuilder?: boolean;
  onOpenHelp: () => void;
  onOpenLanding: () => void;
  onOpenSupervisor: () => void;
  onProfileOverridesChange: (profileId: string, overrides: RuntimeProfileOverrides) => void;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onSuspendTeleop: () => void;
  /** A palette Settings is previewing, so the page around the workspace follows the draft; null when it closes. */
  onPreviewTheme?: (presetId: BloomThemePresetId | null) => void;
  onTopicSample?: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest?: (request: RuntimeTopicSubscriptionRequest) => void;
  /** Switching role from maintenance; the workspace opens that profile's layout. */
  onProfileChange?: (profileId: string) => void;
  preferredProfileId?: string;
  profileOverrides: Readonly<Record<string, RuntimeProfileOverrides>>;
  runtimeActionClient: RuntimeActionClient;
  runtimeActionFeedback: RuntimeActionFeedback | null;
  screen: ScreenConfig;
  selection: WorkspaceSelection;
};

type ScopedApp = { application: ApplicationConfig; selection: WorkspaceSelection };

export function RuntimeWorkspace({
  runtimeCapabilityReport,
  teleopActive,
  teleopNeutralRevision,
  application: storedApplication,
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
  onPreviewTheme,
  onTeleopCommand,
  onTeleopContribution,
  onTopicSample,
  onTopicSubscriptionRequest,
  onProfileChange,
  preferredProfileId = "",
  profileOverrides,
  runtimeActionClient,
  runtimeActionFeedback,
  screen: storedScreen,
  selection,
  openedFromBuilder = false,
}: RuntimeWorkspaceProps) {
  // An app written for one arm sends this arm's gripper values: the rendered screen as well as the app's presets.
  const robotName = runtimeCapabilityReport?.robot_name;
  const application = useMemo(() => withRobotGripper(storedApplication, robotName), [storedApplication, robotName]);
  const screen = useMemo(() => withRobotGripperScreen(storedScreen, robotName), [storedScreen, robotName]);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const artboardFrameRef = useRef<HTMLDivElement | null>(null);
  const runtimeControlsRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
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
  const stopSheetInset = useStopSheetInset(stopRect, runtimeControlsRef, stopFallbackInset);
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
  // Offered once per role per app on this device: the tour was only reachable behind the maintenance hold,
  // so a first-time operator had to find a hold gesture to learn the hold gesture. Hide and opening the
  // tour both answer it; Settings shows it again, or switches the offer off. A Builder preview answers it
  // for the session only, never for the operator.
  const tourOfferKey = guidedTourOfferKey(selection.configId, selection.appId, baseRuntimeProfile.id);
  const [tourOfferAnswered, setTourOfferAnswered] = useState(true);
  useEffect(() => {
    setTourOfferAnswered(isGuidedTourOfferDismissed(tourOfferKey));
  }, [tourOfferKey]);
  const answerTourOffer = () => {
    if (!openedFromBuilder) {
      dismissGuidedTourOffer(tourOfferKey);
    }
    setTourOfferAnswered(true);
  };
  const restoreTourOffer = () => {
    restoreGuidedTourOffer(tourOfferKey);
    setTourOfferAnswered(false);
  };
  const runtimeProfile = useMemo(
    () => resolveRuntimeProfile(application, viewportSize, preferredProfileId, activeProfileOverrides),
    [activeProfileOverrides, application, preferredProfileId, viewportSize],
  );
  const strings = useRuntimeStrings(runtimeProfile.language);
  // Settings previews its draft palette on the whole screen until it saves or discards.
  const [previewThemeId, setPreviewThemeId] = useState<BloomThemePresetId | null>(null);
  const themeId = previewThemeId ?? resolveRuntimeThemePresetId(application, runtimeProfile);
  const themeStyle = useMemo(() => createBloomThemeStyle(BLOOM_THEME_PRESETS[themeId]), [themeId]);
  useEffect(() => {
    onPreviewTheme?.(previewThemeId);
  }, [onPreviewTheme, previewThemeId]);
  useEffect(() => () => onPreviewTheme?.(null), [onPreviewTheme]);
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
  // Which lasting behaviours the running manager declares: each marker parameter is known in the store. Three
  // selectors, so the snapshot moving at 20 Hz re-renders nothing here.
  const commandStoreConnected = useCommandStateConnected();
  const intentMarkerKey = `param:${MANAGER_NODE}:${BEHAVIOUR_MARKER_PARAMETER.intent_scaling}`;
  const assistMarkerKey = `param:${MANAGER_NODE}:${BEHAVIOUR_MARKER_PARAMETER.shared_control}`;
  const intentDeclared = knownValue(useCommandState(intentMarkerKey)) !== null;
  const assistDeclared = knownValue(useCommandState(assistMarkerKey)) !== null;
  const behaviourAvailability = useMemo(() => {
    const known = new Set([...(intentDeclared ? [intentMarkerKey] : []), ...(assistDeclared ? [assistMarkerKey] : [])]);
    return (behaviour: ManagerBehaviour) =>
      behaviourAvailabilityOf(behaviour, commandStoreConnected, (key) => known.has(key));
  }, [assistDeclared, assistMarkerKey, commandStoreConnected, intentDeclared, intentMarkerKey]);
  // The behaviour the manager's own feedback reports on, shown on every screen: it outlives a screen change.
  const intentActive = knownValue(useCommandState(INTENT_SCALING_ACTIVE_KEY))?.value === true;
  const assistActive = knownValue(useCommandState(SHARED_CONTROL_ACTIVE_KEY))?.value === true;
  const activeBehaviour: ManagerBehaviour | null = intentActive
    ? "intent_scaling"
    : assistActive
      ? "shared_control"
      : null;
  const baseControlStateByWidgetId = useMemo(
    () =>
      createRuntimeControlStateByWidgetId(screen, {
        actionPresets: application.action_presets,
        activeCommandFrameId: commandFrameId,
        allowedCommandFrameIds,
        behaviourAvailability,
        behaviourMissing: strings.kiosk.behaviourMissing,
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
      application.action_presets,
      application.runtime_policy.allowed_teleop_targets,
      behaviourAvailability,
      commandFrameId,
      commandFrameError,
      effectiveTeleopTargets,
      allowedCommandFrameIds,
      runtimeCapabilityReport?.capabilities,
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
  const effectiveDataByWidgetId = useEffectiveWidgetData({
    cameraFrames,
    commandTwist,
    dataByWidgetId,
    plotSelections: plotSelections.selections,
    positionLibrary: screenHasPositionLibrary ? positionLibrary.state : null,
    screen,
  });
  const runtimeStop = useRuntimeStop(runtimeActionClient);
  const runtimeControl = useRuntimeControl(runtimeActionClient, onSuspendTeleop);
  const ownsRuntimeControl = !runtimeControl.supported || runtimeControl.state?.is_owner === true;
  const runtimeControlBlocked = runtimeControl.supported && !ownsRuntimeControl;
  const stopped = runtimeStop.state?.stopped === true || runtimeStop.stopRequested;
  // Not asserted, or the engage failed: STOP must be resendable. Not while a normal STOP is in flight.
  const stopNeedsReassert =
    (runtimeStop.state?.stopped === true && !runtimeStop.state.asserted) || runtimeStop.engageUnconfirmed;
  const scanMode = runtimeProfile.motorAccessibilityPreset === "scan";
  const isAssistiveRuntimeTargetEnabled = (target: HTMLElement) => {
    // Not in control: claim, STOP, and the way out; maintenance holds motion, and without it a switch or dwell
    // operator refused the claim could reach neither Settings nor another app.
    if (runtimeControlBlocked) {
      return (
        target.hasAttribute("data-runtime-control-independent") || target.hasAttribute("data-assistive-maintenance")
      );
    }
    // Stopped: resume, and the way out. Maintenance holds motion anyway, so a
    // switch or dwell operator is not locked on the screen they stopped on.
    return (
      !stopped ||
      target.dataset.dwellAction === "resume" ||
      target.dataset.dwellAction === "stop-again" ||
      target.hasAttribute("data-assistive-maintenance")
    );
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
  // An unconfirmed STOP reads STOPPED too: READY over controls this screen is holding was a false all-clear.
  const chipStopState = runtimeStop.stopRequested
    ? { asserted: false, detail: "", engaged_at: "", ...runtimeStop.state, stopped: true }
    : runtimeStop.state;
  const resolvedChip = resolveRuntimeStatusChip(chipStopState, runtimeLink, strings, {
    heldForMaintenance: motionHeld,
    notInControl: runtimeControlBlocked,
  });
  // Bloom Debug says what it is where an operator app says READY; every warning still outranks it.
  const statusChip =
    application.id === "bloom-debug" && resolvedChip?.tone === "ready"
      ? { label: strings.status.debug, tone: "debug" as const }
      : resolvedChip;
  useAudioCues(statusChip?.tone, runtimeProfile.audioCues);
  useSwitchKeyGuard(scanMode, workspaceRef);
  const scanning = useSwitchScanning({
    // Maintenance covers the canvas; a switch press there must not reach it.
    // Scanning stays on while stopped: isTargetEnabled leaves resume as the
    // only target, and turning it off would latch a switch operator out.
    enabled: scanMode && !maintenanceOpen && !settingsOpen && !tourOpen,
    isTargetEnabled: isAssistiveRuntimeTargetEnabled,
    periodMs: runtimeProfile.scanPeriodMs,
    // The whole view, not just the canvas: the bar's maintenance button is the
    // only way to Settings, another screen, another role, or out.
    rootRef: workspaceRef,
    revision: `${screen.id}:${runtimeProfile.motorAccessibilityPreset}:${runtimeControlBlocked}:${stopped}:${stopNeedsReassert}`,
  });
  useStoppedControls(canvasViewportRef, stopped);
  useDwellActivation({
    dwellMs: runtimeProfile.dwellMs,
    enabled: runtimeProfile.dwellEnabled && !maintenanceOpen && !settingsOpen && !tourOpen,
    // Touch only: leaves for a page with no dwell.
    isTargetEnabled: (target) =>
      !target.hasAttribute("data-scan-touch-only") && isAssistiveRuntimeTargetEnabled(target),
    // The whole view, as scanning uses: a dwell operator needs the bar's maintenance button too.
    rootRef: workspaceRef,
  });
  // Settings, the tour and maintenance run their own dwell on their own panel, and STOP is drawn outside
  // each: a head or eye pointer could not stop the arm while one was open. This one answers only STOP.
  const documentBodyRef = useRef(typeof document === "undefined" ? null : document.body);
  useDwellActivation({
    dwellMs: runtimeProfile.dwellMs,
    enabled: runtimeProfile.dwellEnabled && (maintenanceOpen || settingsOpen || tourOpen),
    isTargetEnabled: (target) => target.dataset.scanPriority === "stop",
    rootRef: documentBodyRef,
  });
  const previousScreenIdRef = useRef(screen.id);
  motionHeldRef.current = motionHeld;
  const holdMotion = () => {
    motionHeldRef.current = true;
    onSuspendTeleop();
  };
  const handleRuntimeActionIntent = (
    intent: Parameters<WidgetActionIntentHandler>[0],
    scoped: ScopedApp = { application, selection },
  ): ReturnType<WidgetActionIntentHandler> => {
    // A detached control of an app no longer open finishes through that app's policy, never this one's.
    const current = scoped.selection.appId === selection.appId && scoped.selection.configId === selection.configId;
    // Choosing what a plot shows is view state: no ownership needed, nothing reaches the robot.
    if (intent.type === "plot-series-toggle") {
      plotSelections.toggle(intent.plotId, intent.seriesKey);
      return { accepted: true };
    }
    const refusal = resolveRuntimeIntentRefusal(intent, {
      held: motionHeldRef.current,
      ownsControl: ownsRuntimeControl,
      stopped,
      unavailable: current && controlStateByWidgetId[intent.widgetId]?.unavailable === true,
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
    if (current && positionLibrary.handleIntent(intent)) {
      return { accepted: true };
    }
    return onActionIntent(intent, {
      action_presets: scoped.application.action_presets,
      allowedCommandFrameIds: current ? (allowedCommandFrameIds ?? undefined) : undefined,
      appId: scoped.selection.appId,
      configId: scoped.selection.configId,
      onCommandFrameChange: current ? setCommandFrameId : undefined,
      runtime_policy: {
        ...scoped.application.runtime_policy,
        command_frame_id: current ? (commandFrameId ?? "") : scoped.application.runtime_policy.command_frame_id,
      },
    });
  };

  // A new function identity each render would re-render every widget; the ref keeps the newest handler.
  const actionIntentRef = useRef(handleRuntimeActionIntent);
  actionIntentRef.current = handleRuntimeActionIntent;
  // One handler per app and configuration: a servo switch-off sent while leaving goes out under its own app.
  const appScope = `${selection.appId}\u0000${selection.configId}`;
  const scopedAppsRef = useRef(new Map<string, ScopedApp>());
  scopedAppsRef.current.set(appScope, { application, selection });
  const stableActionIntent = useCallback<WidgetActionIntentHandler>(
    (intent) => actionIntentRef.current(intent, scopedAppsRef.current.get(appScope)),
    [appScope],
  );

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
        onEngage={() => {
          // Zero here, not after the round trip: the socket still streams while the request travels.
          onSuspendTeleop();
          runtimeStop.engage();
        }}
        onResume={runtimeStop.resume}
        requestError={runtimeStop.requestError}
        resumeDisabled={runtimeControlBlocked}
        resumeDisabledReason={runtimeControlBlocked ? strings.control.resumeRequiresOwner : ""}
        stopped={runtimeStop.stopRequested ? true : (runtimeStop.state?.stopped ?? null)}
        reassert={stopNeedsReassert}
        scanMode={scanMode}
        dwellMode={runtimeProfile.dwellEnabled}
        // Always sent: "" (no latch seen here) must not release a STOP pressed at another station.
        latchId={runtimeStop.state?.stopped ? runtimeStop.state.engaged_at : ""}
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
        data-bloom-theme={themeId}
        style={{ ...themeStyle, "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
      >
        <RuntimeSettingsPanel
          applicationName={application.name}
          appThemePresetId={normalizeBloomThemePresetId(application.theme.preset_id)}
          onPreviewTheme={setPreviewThemeId}
          baseProfile={baseRuntimeProfile}
          gamepadName={gamepad.connected ? gamepad.id : null}
          key={profileOverrideKey}
          onClose={() => setSettingsOpen(false)}
          statusChip={statusChip}
          onSave={(nextOverrides) => onProfileOverridesChange(baseRuntimeProfile.id, nextOverrides)}
          overrides={activeProfileOverrides}
          practiceOffer={{ hidden: tourOfferAnswered, onRestore: restoreTourOffer }}
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
        data-bloom-theme={themeId}
        style={{ ...themeStyle, "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
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
      data-bloom-theme={themeId}
      style={{ ...themeStyle, "--runtime-font-scale": runtimeProfile.fontScale } as CSSProperties}
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
        activeBehaviour={activeBehaviour}
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
        onBackToBuilder={openedFromBuilder ? onEditScreen : undefined}
        profile={{
          id: baseRuntimeProfile.id,
          layoutId: profileLayoutId(application, baseRuntimeProfile.id),
          menuOnTap: application.profiles.find((candidate) => candidate.id === baseRuntimeProfile.id)?.menu_on_tap,
          name: runtimeProfile.name,
        }}
        profiles={application.profiles.map((candidate) => ({
          id: candidate.id,
          layoutId: candidate.preferred_control_layout_id,
          motorAccessibilityPreset:
            profileOverrides[runtimeProfileOverrideKey(selection, candidate.id)]?.motorAccessibilityPreset ??
            candidate.motor_accessibility_preset,
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
          answerTourOffer();
          holdMotion();
          setTourOpen(true);
        }}
        tourOffer={
          tourOfferAnswered || runtimeProfile.practiceOffer === "off"
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
                // A crashed teleop control shows "sending nothing": the suspend makes that true.
                onWidgetFailed: (widgetId) => {
                  const widget = screen.widgets.find((candidate) => candidate.id === widgetId);
                  if (widget && usesTeleopAdapter(widget)) {
                    onSuspendTeleop();
                  }
                },
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
            <p aria-live="off" className="sr-only">
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

        {/* One tree position whether scanning or not: a remount when scanning starts left the first highlight on a
            detached STOP. */}
        {renderStopControl(scanning.index >= 0 && stopRect ? splitStopRegion(stopRect).stop : stopRect)}
        {scanning.index >= 0 && stopRect ? (
          <>
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
            <p aria-live="off" className="sr-only">
              {strings.scan.progress(scanning.index + 1, scanning.targetCount)}
            </p>
          </>
        ) : null}
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

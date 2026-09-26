import type { ApplicationConfig, RuntimeControlState, RuntimeStopState } from "@bloom/api-client";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { RuntimeRobotStatusPanel } from "./RuntimeRobotStatusPanel";
import type { RuntimeProfileOverrides } from "./runtime-profile-overrides";
import { runtimeProfileOverrideKey } from "./runtime-profile-overrides";
import { resolveRuntimeStatusChip } from "./runtime-status-chip";
import type { RuntimeModeState } from "./runtimeModeState";
import { resolveRuntimeProfile } from "./runtimeProfile";
import { useRuntimeStrings } from "./strings";
import type { SupervisorRuntimeClient } from "./supervisor-client";
import { useRuntimeLinkState } from "./use-runtime-link-state";

const SUPERVISOR_REFRESH_MS = 2000;
const EMPTY_PROFILE_OVERRIDES: RuntimeProfileOverrides = {};

type SupervisorWorkspaceProps = {
  application: ApplicationConfig;
  client: SupervisorRuntimeClient;
  commandFrameId: string | null;
  modeState: RuntimeModeState;
  onBackToLibrary: () => void;
  preferredProfileId: string;
  profileOverrides: Readonly<Record<string, RuntimeProfileOverrides>>;
  robotName: string | null;
  selection: WorkspaceSelection;
};

export function SupervisorWorkspace({
  application,
  client,
  commandFrameId,
  modeState,
  onBackToLibrary,
  preferredProfileId,
  profileOverrides,
  robotName,
  selection,
}: SupervisorWorkspaceProps) {
  const viewport = useMemo(() => getViewport(), []);
  const baseProfile = useMemo(
    () => resolveRuntimeProfile(application, viewport, preferredProfileId),
    [application, preferredProfileId, viewport],
  );
  const overrides = profileOverrides[runtimeProfileOverrideKey(selection, baseProfile.id)] ?? EMPTY_PROFILE_OVERRIDES;
  const profile = useMemo(
    () => resolveRuntimeProfile(application, viewport, preferredProfileId, overrides),
    [application, overrides, preferredProfileId, viewport],
  );
  const strings = useRuntimeStrings(profile.language);
  const link = useRuntimeLinkState(client);
  const stopState = useSupervisorStopState(client);
  const controlState = useSupervisorControlState(client);
  const statusChip = resolveRuntimeStatusChip(stopState, link, strings);
  // The operating session's own state beats this browser's copy of it. The
  // backend keeps the last frame the operator sent; without one, the app's
  // configured frame is what the next command would carry.
  const operatorFrameId = controlState?.owner_frame_id ?? "";
  const operatorIsDriving = controlState?.owner_moving === true;
  const requestedMode = controlState?.owner_mode_request || modeState.requestedMode;

  return (
    <section
      aria-label={strings.supervisor.title}
      className="supervisor-workspace"
      style={{ "--runtime-font-scale": profile.fontScale } as CSSProperties}
    >
      <header className="supervisor-header">
        <div>
          <p className="eyebrow">{strings.supervisor.readOnly}</p>
          <h1>{application.name}</h1>
        </div>
        {statusChip ? (
          <span className="runtime-kiosk-status" data-tone={statusChip.tone} role="status">
            <span aria-hidden="true" className="runtime-kiosk-status-dot" />
            {statusChip.label}
          </span>
        ) : null}
        <button onClick={onBackToLibrary} type="button">
          {strings.supervisor.backToLibrary}
        </button>
      </header>

      <div className="supervisor-ownership" role="note">
        <strong>
          {controlState
            ? controlState.owner_present
              ? strings.supervisor.operatorOwnsControl
              : strings.supervisor.noOperatorOwnsControl
            : strings.supervisor.controlOwnerUnknown}
        </strong>
        <p>{strings.supervisor.ownershipDetail}</p>
      </div>

      <dl className="supervisor-facts">
        <div>
          <dt>{strings.supervisor.application}</dt>
          <dd>{application.name}</dd>
        </div>
        <div>
          <dt>{strings.supervisor.robot}</dt>
          <dd>{robotName ?? strings.supervisor.notReported}</dd>
        </div>
        <div>
          <dt>{operatorFrameId ? strings.supervisor.activeFrame : strings.supervisor.commandFrame}</dt>
          <dd>{operatorFrameId || commandFrameId || strings.supervisor.notReported}</dd>
          <small>{operatorIsDriving ? strings.supervisor.driving : strings.supervisor.holding}</small>
        </div>
        <div>
          <dt>{strings.supervisor.stopLatch}</dt>
          <dd data-state={stopState ? (stopState.stopped ? "stopped" : "running") : "unknown"}>
            {stopState
              ? stopState.stopped
                ? stopState.asserted
                  ? strings.supervisor.stopped
                  : strings.supervisor.stoppedNotAsserted
                : strings.supervisor.running
              : strings.supervisor.notReported}
          </dd>
          {/* Not asserted covers a latch restored after a restart too: the backend has not told the robot since. */}
          {stopState?.stopped && !stopState.asserted && stopState.detail ? <small>{stopState.detail}</small> : null}
        </div>
        <div>
          <dt>{strings.supervisor.lastRequest}</dt>
          <dd>
            {requestedMode ?? (controlState ? strings.supervisor.noModeRequested : strings.supervisor.neverRequested)}
          </dd>
          {modeState.updatedAt ? <small>{strings.supervisor.updatedAt(formatTime(modeState.updatedAt))}</small> : null}
        </div>
      </dl>

      <RuntimeRobotStatusPanel
        application={application}
        client={client}
        modeState={modeState}
        refreshIntervalMs={SUPERVISOR_REFRESH_MS}
        sessionStatus={resolveSessionStatus(link.state)}
        showConfiguredModeFallback={false}
        strings={strings.supervisor.status}
      />
    </section>
  );
}

function useSupervisorControlState(client: SupervisorRuntimeClient): RuntimeControlState | null {
  const [state, setState] = useState<RuntimeControlState | null>(null);

  useEffect(() => {
    if (!client.getRuntimeControlState) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      client
        .getRuntimeControlState?.()
        .then((nextState) => {
          if (!cancelled) {
            setState(nextState);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(refresh, SUPERVISOR_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client]);

  return state;
}

function useSupervisorStopState(client: SupervisorRuntimeClient): RuntimeStopState | null {
  const [state, setState] = useState<RuntimeStopState | null>(null);

  useEffect(() => {
    if (!client.getRuntimeStopState) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      client
        .getRuntimeStopState?.()
        .then((nextState) => {
          if (!cancelled) {
            setState(nextState);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(refresh, SUPERVISOR_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client]);

  return state;
}

function resolveSessionStatus(
  linkState: ReturnType<typeof useRuntimeLinkState>["state"],
): "checking" | "live" | "local" | "unavailable" {
  if (linkState === "connected") {
    return "live";
  }
  if (linkState === "connecting") {
    return "checking";
  }
  if (linkState === "disconnected") {
    return "unavailable";
  }
  return "local";
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getViewport() {
  if (typeof window === "undefined") {
    return { height: 720, width: 1280 };
  }
  return { height: window.innerHeight, width: window.innerWidth };
}

import type { ApplicationConfig, RuntimeStopState } from "@bloom/api-client";
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
  const statusChip = resolveRuntimeStatusChip(stopState, link, strings);
  const requestedMode = modeState.requestedMode;

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
        <strong>{strings.supervisor.operatorOwnsControl}</strong>
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
          <dt>{strings.supervisor.commandFrame}</dt>
          <dd>{commandFrameId ?? strings.supervisor.notReported}</dd>
        </div>
        <div>
          <dt>{strings.supervisor.stopLatch}</dt>
          <dd data-state={stopState ? (stopState.stopped ? "stopped" : "running") : "unknown"}>
            {stopState
              ? stopState.stopped
                ? strings.supervisor.stopped
                : strings.supervisor.running
              : strings.supervisor.notReported}
          </dd>
        </div>
        <div>
          <dt>{strings.supervisor.lastRequest}</dt>
          <dd>{requestedMode ?? strings.supervisor.neverRequested}</dd>
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

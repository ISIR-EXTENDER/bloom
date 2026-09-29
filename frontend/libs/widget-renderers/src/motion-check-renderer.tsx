import {
  type ActiveGripper,
  createMotionCheckState,
  DRIVE_CHIP_WORDS,
  type DriveLogEntry,
  FINGER_WAIT_MS,
  fingerPosition,
  GRIPPER_CHIP_WORDS,
  type GripperLogEntry,
  hidesTitle,
  liveDrive,
  type MotionCheckState,
  type MotionLogEntry,
  motionLogCsv,
  motionProfile,
  shortJoints,
  type Vector3,
} from "@bloom/widgets";
import type { WidgetRendererProps } from "./types";

/**
 * Command vs motion (Bloom Debug): while a Drive control is held, the wire beside what qontrol commanded and what the
 * measured tip did; for the gripper, the command beside the finger's trace. Each ends in a verdict with the
 * simulation checks' own rules, kept in a log of the last twenty the bench can export.
 */
export function MotionCheckWidget({ data, descriptor }: WidgetRendererProps) {
  const state = data?.type === "motion-check" ? data.state : createMotionCheckState();
  const profile = motionProfile(state);
  const lastDrive = state.log.find((entry): entry is DriveLogEntry => entry.kind === "drive");
  const gripperEntry = state.gripper?.entryId
    ? state.log.find((entry): entry is GripperLogEntry => entry.id === state.gripper?.entryId)
    : undefined;
  const newest = state.log[0];

  return (
    <div className="bloom-motion-check bloom-info-card" data-robot={state.robot}>
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <span className="bloom-widget-readout">
            {state.robot === "kinova" ? "Kinova" : "Explorer"} rules · tip{" "}
            {state.tip ? (state.tipFrame ?? profile.tipFrame) : "not reported (no TF)"}
          </span>
        </header>
      )}
      <div className="bloom-motion-panes">
        <DrivePane lastDrive={lastDrive} state={state} />
        <GripperPane entry={gripperEntry} gripper={state.gripper} state={state} />
      </div>
      <VerdictLog log={state.log} />
      <p aria-live="polite" className="sr-only">
        {newest ? `${gestureName(newest)}: ${chipWord(newest)}` : ""}
      </p>
    </div>
  );
}

function DrivePane({ lastDrive, state }: { lastDrive: DriveLogEntry | undefined; state: MotionCheckState }) {
  const live = liveDrive(state);
  const settling = state.drive?.releasedAt != null;
  if (live) {
    const joints = shortJoints(state);
    return (
      <section aria-label="Drive" className="bloom-motion-pane" data-phase={settling ? "settling" : "held"}>
        <header>
          <h4>Drive</h4>
          <span className="bloom-motion-chip" data-grade="pending">
            {settling ? "settling" : "held"}
          </span>
        </header>
        <Readings
          commanded={live.commanded.moved}
          commandedAlong={live.commanded.along}
          dip={live.horizontal ? live.dip : null}
          joints={joints}
          measured={live.measured?.moved ?? null}
          measuredAlong={live.measured?.along ?? null}
          unit={live.unit}
          wireAxis={live.wireAxis}
          word={live.word}
        />
      </section>
    );
  }
  if (!lastDrive) {
    return (
      <section aria-label="Drive" className="bloom-motion-pane" data-phase="idle">
        <header>
          <h4>Drive</h4>
        </header>
        <p className="bloom-debug-empty">
          {state.mixed
            ? "Several axes at once: hold one Drive control to judge it."
            : state.pose
              ? "Hold a Drive control: the wire, the commanded hand and the measured tip show here."
              : "Waiting for /ee_pose."}
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Drive" className="bloom-motion-pane" data-phase="judged">
      <header>
        <h4>Drive</h4>
        <VerdictChip entry={lastDrive} />
      </header>
      <Readings
        commanded={lastDrive.commanded}
        commandedAlong={lastDrive.commandedAlong}
        dip={lastDrive.horizontal ? lastDrive.dip : null}
        joints={lastDrive.shortJoints}
        measured={lastDrive.measured}
        measuredAlong={lastDrive.measuredAlong}
        unit={lastDrive.unit}
        wireAxis={lastDrive.wireAxis}
        word={lastDrive.word}
      />
      {lastDrive.reasons.length > 0 ? <p className="bloom-motion-reasons">{lastDrive.reasons.join(" · ")}</p> : null}
    </section>
  );
}

function Readings(props: {
  commanded: Vector3;
  commandedAlong: number;
  dip: number | null;
  joints: readonly { gap: number; name: string }[];
  measured: Vector3 | null;
  measuredAlong: number | null;
  unit: "m" | "rad";
  wireAxis: string;
  word: string | null;
}) {
  return (
    <dl className="bloom-motion-readings">
      <dt>Wire</dt>
      <dd data-reading="wire">
        {wireText(props.wireAxis)}
        {props.word ? ` · ${props.word}` : ""}
      </dd>
      <dt>Commanded (/ee_pose)</dt>
      <dd data-reading="commanded">
        {vectorText(props.commanded, props.unit)} · {percent(props.commandedAlong)} along
      </dd>
      <dt>Measured (TF tip)</dt>
      <dd data-reading="measured">{props.measured ? vectorText(props.measured, props.unit) : "no tip reported"}</dd>
      <dt>Agreement along the command</dt>
      <dd data-reading="agreement">{props.measuredAlong === null ? "—" : percent(props.measuredAlong)}</dd>
      <dt>Vertical dip</dt>
      <dd data-reading="dip">{props.dip === null ? "—" : `${(props.dip * 100).toFixed(1)} cm`}</dd>
      <dt>Joints short of their command</dt>
      <dd data-reading="joints">
        {props.joints.length === 0
          ? "none"
          : props.joints.map((row) => `${row.name} ${signed(row.gap, 2)} rad`).join(", ")}
      </dd>
    </dl>
  );
}

function GripperPane({
  entry,
  gripper,
  state,
}: {
  entry: GripperLogEntry | undefined;
  gripper: ActiveGripper | null;
  state: MotionCheckState;
}) {
  const profile = motionProfile(state);
  const finger = fingerPosition(state);
  if (!gripper) {
    return (
      <section aria-label="Gripper" className="bloom-motion-pane" data-phase="idle">
        <header>
          <h4>Gripper</h4>
        </header>
        <p className="bloom-debug-empty">
          Press Open or Close: the command and {profile.finger} over time show here
          {finger === null ? "." : ` (now ${finger.toFixed(2)} rad).`}
        </p>
      </section>
    );
  }
  const last = gripper.trace.at(-1)?.position ?? finger;
  const travel =
    gripper.before === null || last === null ? 0 : (last - gripper.before) * (gripper.direction > 0 ? 1 : -1);
  return (
    <section aria-label="Gripper" className="bloom-motion-pane" data-phase={entry ? "judged" : "held"}>
      <header>
        <h4>Gripper</h4>
        {entry ? (
          <VerdictChip entry={entry} />
        ) : (
          <span className="bloom-motion-chip" data-grade="pending">
            {gripper.repeat ? "already there" : "watching"}
          </span>
        )}
      </header>
      <dl className="bloom-motion-readings">
        <dt>Command</dt>
        <dd data-reading="gripper-command">
          {gripper.word} · {gripper.value.toFixed(2)}
        </dd>
        <dt>{profile.finger}</dt>
        <dd data-reading="finger">
          {gripper.before === null ? "—" : gripper.before.toFixed(2)} → {last === null ? "—" : last.toFixed(2)} rad
        </dd>
        <dt>Travel</dt>
        <dd data-reading="travel">
          {Math.abs(travel) < 0.02
            ? "still"
            : `${(last ?? 0) > (gripper.before ?? 0) ? "closing" : "opening"} (${travel > 0 ? "as asked" : "the other way"})`}
        </dd>
        <dt>Started moving</dt>
        <dd data-reading="start">{msText(gripper.startMs)}</dd>
        <dt>Arrived</dt>
        <dd data-reading="arrive">{msText(gripper.arriveMs)}</dd>
      </dl>
      <FingerTrace gripper={gripper} />
      {entry?.lateMoveMs != null ? (
        <p className="bloom-motion-reasons">Moved late, {msText(entry.lateMoveMs)} after the command.</p>
      ) : null}
    </section>
  );
}

const TRACE_WIDTH = 320;
const TRACE_HEIGHT = 64;

function FingerTrace({ gripper }: { gripper: ActiveGripper }) {
  const points = gripper.trace;
  if (points.length < 2) {
    return null;
  }
  const span = Math.max(FINGER_WAIT_MS, points.at(-1)?.at ?? 0);
  const values = points.map((point) => point.position);
  const low = Math.min(...values) - 0.02;
  const high = Math.max(...values) + 0.02;
  const x = (at: number) => (at / span) * TRACE_WIDTH;
  const y = (value: number) => TRACE_HEIGHT - ((value - low) / (high - low)) * TRACE_HEIGHT;
  const line = points.map((point) => `${x(point.at).toFixed(1)},${y(point.position).toFixed(1)}`).join(" ");
  return (
    <svg
      aria-label={`Finger over ${(span / 1000).toFixed(1)} s, from ${values[0]?.toFixed(2)} to ${values.at(-1)?.toFixed(2)} rad`}
      className="bloom-motion-trace"
      role="img"
      viewBox={`0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`}
    >
      <line
        className="bloom-motion-trace-wait"
        x1={x(FINGER_WAIT_MS)}
        x2={x(FINGER_WAIT_MS)}
        y1={0}
        y2={TRACE_HEIGHT}
      />
      <polyline className="bloom-motion-trace-line" points={line} />
    </svg>
  );
}

function VerdictLog({ log }: { log: readonly MotionLogEntry[] }) {
  const exportCsv = () => {
    const blob = new Blob([motionLogCsv(log)], { type: "text/csv" });
    if (typeof URL.createObjectURL !== "function") {
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bloom-command-vs-motion-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <section aria-label="Verdict log" className="bloom-motion-log">
      <header>
        <h4>Last {log.length === 1 ? "verdict" : `${log.length} verdicts`}</h4>
        <button disabled={log.length === 0} onClick={exportCsv} type="button">
          Export CSV
        </button>
      </header>
      {log.length === 0 ? (
        <p className="bloom-debug-empty">No verdict yet.</p>
      ) : (
        <div className="bloom-motion-log-scroll">
          <table className="bloom-motion-table">
            <thead>
              <tr>
                <th className="bloom-motion-cell bloom-motion-colhead" scope="col">
                  Time
                </th>
                <th className="bloom-motion-cell bloom-motion-colhead" scope="col">
                  Gesture
                </th>
                <th className="bloom-motion-cell bloom-motion-colhead" scope="col">
                  Verdict
                </th>
                <th className="bloom-motion-cell bloom-motion-colhead" scope="col">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr data-grade={entry.grade} key={entry.id}>
                  <td className="bloom-motion-cell bloom-motion-mono">
                    {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
                  </td>
                  <th className="bloom-motion-cell" scope="row">
                    {gestureName(entry)}
                  </th>
                  <td className="bloom-motion-cell">
                    <VerdictChip entry={entry} />
                  </td>
                  <td className="bloom-motion-cell bloom-motion-mono">{entryDetail(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function VerdictChip({ entry }: { entry: MotionLogEntry }) {
  return (
    <span className="bloom-motion-chip" data-chip={entry.chip} data-grade={entry.grade}>
      {chipWord(entry)}
    </span>
  );
}

function chipWord(entry: MotionLogEntry): string {
  return entry.kind === "drive" ? DRIVE_CHIP_WORDS[entry.chip] : GRIPPER_CHIP_WORDS[entry.chip];
}

function gestureName(entry: MotionLogEntry): string {
  return entry.kind === "drive" ? (entry.word ?? wireText(entry.wireAxis)) : `${entry.word} gripper`;
}

function entryDetail(entry: MotionLogEntry): string {
  if (entry.kind === "gripper") {
    const travel =
      entry.before === null || entry.after === null ? "" : `${entry.before.toFixed(2)} → ${entry.after.toFixed(2)} rad`;
    const late = entry.lateMoveMs === null ? "" : `, moved at ${msText(entry.lateMoveMs)}`;
    return `${entry.value.toFixed(2)} sent; ${travel}${entry.startMs === null ? "" : `, started ${msText(entry.startMs)}`}${late}`;
  }
  const measured = entry.measuredAlong === null ? "no tip" : `${percent(entry.measuredAlong)} along`;
  const dip = entry.horizontal ? `, dip ${(entry.dip * 100).toFixed(1)} cm` : "";
  const joints = entry.shortJoints.length
    ? `, ${entry.shortJoints[0]?.name} ${signed(entry.shortJoints[0]?.gap ?? 0, 2)} rad`
    : "";
  return `${wireText(entry.wireAxis)}; ${measured}${dip}${joints}`;
}

function wireText(axis: string): string {
  const sign = axis.endsWith("-") ? "−" : "+";
  return `${axis.slice(0, -1)} ${sign}1`;
}

function vectorText(vector: Vector3, unit: "m" | "rad"): string {
  if (unit === "m") {
    return `${signed(vector.x * 100, 1)} ${signed(vector.y * 100, 1)} ${signed(vector.z * 100, 1)} cm`;
  }
  return `${signed(vector.x, 3)} ${signed(vector.y, 3)} ${signed(vector.z, 3)} rad`;
}

function signed(value: number, digits: number): string {
  const rounded = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${rounded < 0 ? "−" : "+"}${Math.abs(rounded).toFixed(digits)}`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function msText(ms: number | null): string {
  return ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

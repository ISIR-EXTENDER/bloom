import {
  BloomApiError,
  type RosTopicStatus,
  type RuntimeAuditRecord,
  type RuntimeRecordingStartRequest,
} from "@bloom/api-client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BloomDebugPanel } from "./BloomDebugPanel";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

const topic = (name: string, publisher_count?: number, subscription_count?: number): RosTopicStatus =>
  ({ name, message_type: "std_msgs/msg/String", publisher_count, subscription_count }) as RosTopicStatus;

const audit = (status: string, detail: string, repeats?: number): RuntimeAuditRecord => ({
  channel: "recording",
  detail,
  message_type: "",
  payload_summary: {},
  recorded_at: `2026-09-29T10:00:0${status.length}Z`,
  repeats,
  session_id: "s",
  status,
  target: "",
  topic: "/joint_states",
});

/** A backend whose recorder keeps what it was asked to record, and whose audit grows with each start and stop. */
function backend(options: { statusFails?: boolean; topics?: RosTopicStatus[]; noStatus?: boolean } = {}) {
  const records: RuntimeAuditRecord[] = [];
  const recordings: { id: string; topics: string[]; stopped: boolean }[] = [];
  const topics = options.topics ?? [
    topic("/joint_states", 1, 0),
    topic("/joystick_cartesian_command", 0, 1),
    topic("/rosout", 2, 2),
  ];
  const client: RuntimeActionClient = {
    listRosTopics: async () => topics.map(({ name, message_type }) => ({ name, message_type })),
    listRosTopicStatus: options.noStatus
      ? undefined
      : async () => {
          if (options.statusFails) throw new Error("status unavailable");
          return topics;
        },
    listRuntimeAuditRecords: async (limit: number) => records.slice(-limit).reverse(),
    startRuntimeRecording: async (request: RuntimeRecordingStartRequest) => {
      const id = `rec-${recordings.length + 1}`;
      recordings.push({ id, topics: request.topics, stopped: false });
      records.push(audit("recording", `Recording ${request.topics.length} topics.`));
      return {
        detail: `Started ${id}.`,
        output_folder: request.output_folder,
        recording_id: id,
        status: "recording",
        topics: request.topics,
      };
    },
    stopRuntimeRecording: async (id: string) => {
      const entry = recordings.find((candidate) => candidate.id === id);
      if (entry) entry.stopped = true;
      records.push(audit("stopped", `Stopped ${id}.`));
      return {
        detail: `Stopped ${id}.`,
        output_folder: "data/recordings",
        recording_id: id,
        status: "stopped",
        topics: entry?.topics ?? [],
      };
    },
  } as unknown as RuntimeActionClient;
  return { client, records, recordings };
}

const status = () => document.querySelector(".bloom-debug-panel-actions p")?.textContent;

describe("the debug panel", () => {
  it("says what is not connected before offering anything", async () => {
    render(<BloomDebugPanel client={{} as RuntimeActionClient} />);
    expect(screen.getByText("Load topics to start a debug session.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("Topic catalog is not connected in this runtime."));
    fireEvent.click(screen.getByRole("button", { name: "Refresh audit" }));
    await waitFor(() => expect(status()).toBe("Runtime audit is not connected in this runtime."));
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(status()).toBe("Recording adapter is not connected in this runtime."));
  });

  it("grades the robot preflight from the graph and preselects the robot topics to record", async () => {
    const { client } = backend();
    render(<BloomDebugPanel client={client} region={{ left: 10, top: 20, scale: 0.5, width: 300 }} />);
    expect(screen.getByRole("complementary", { name: "Bloom Debug controls" })).toHaveAttribute(
      "data-placement",
      "region",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("3 topics available."));

    const preflight = screen.getByRole("region", { name: "Robot preflight" });
    expect(within(preflight).getByText("2 of 3 ready")).toBeInTheDocument();
    fireEvent.click(within(preflight).getByRole("button", { name: "Show" }));
    expect(within(preflight).getByText("Teleop command").parentElement?.parentElement).toHaveTextContent("Ready");
    expect(within(preflight).getByText("Controller feedback").parentElement?.parentElement).toHaveTextContent(
      "Missing",
    );

    const catalog = screen.getByRole("region", { name: "Topic catalog" });
    expect(within(catalog).getByText("3 topics · 2 to record")).toBeInTheDocument();
    fireEvent.click(within(catalog).getByRole("button", { name: "Show" }));
    const boxes = within(catalog).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, true, false]);
    expect(within(catalog).getByText("2 pub · 2 sub")).toBeInTheDocument();
    fireEvent.click(boxes[2] as HTMLInputElement);
    fireEvent.click(boxes[0] as HTMLInputElement);
    expect(within(catalog).getByText("3 topics · 2 to record")).toBeInTheDocument();
    expect((within(catalog).getAllByRole("checkbox") as HTMLInputElement[]).map((box) => box.checked)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("falls back to the plain topic list when status is unavailable, and marks those only as visible", async () => {
    const { client } = backend({ statusFails: true });
    render(<BloomDebugPanel client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("3 topics available."));
    const preflight = screen.getByRole("region", { name: "Robot preflight" });
    expect(within(preflight).getByText("0 of 3 ready")).toBeInTheDocument();
    fireEvent.click(within(preflight).getByRole("button", { name: "Show" }));
    expect(within(preflight).getAllByText("Visible")).toHaveLength(2);
  });

  it("reports an empty graph, a failed catalog, and a status-only backend that fails", async () => {
    const empty = backend({ topics: [] });
    const { unmount } = render(<BloomDebugPanel client={empty.client} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("No live topics discovered yet."));
    unmount();

    const failing = {
      listRosTopicStatus: async () => {
        throw new BloomApiError("Unavailable", 503, JSON.stringify({ detail: "ROS is down." }));
      },
    } as unknown as RuntimeActionClient;
    render(<BloomDebugPanel client={failing} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("Unavailable ROS is down."));
  });

  it("records the selected topics, adds the audit records, and stops on request", async () => {
    const { client, recordings } = backend();
    render(<BloomDebugPanel client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(status()).toBe("Select at least one topic before starting a recording."));

    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("3 topics available."));
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument());
    expect(recordings).toEqual([
      { id: "rec-1", topics: ["/joystick_cartesian_command", "/joint_states"], stopped: false },
    ]);
    const auditCard = screen.getByRole("region", { name: "Runtime audit" });
    expect(within(auditCard).getByText("1 records · latest recording")).toBeInTheDocument();
    expect(within(auditCard).getByText("Recording. Stop it to add the record.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument());
    expect(recordings[0]?.stopped).toBe(true);
    // The receipt is announced, then the audit reload takes the line over.
    expect(status()).toBe("2 audit records loaded.");
    expect(within(auditCard).getByText("2 records · latest stopped")).toBeInTheDocument();
    fireEvent.click(within(auditCard).getByRole("button", { name: "Show" }));
    expect(within(auditCard).getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows how often an audit line repeated and what it was about, and says when there are none", async () => {
    const records = [
      audit("failed", "Refused by policy", 3),
      { ...audit("published", "Sent"), topic: "", target: "/cartesian_manager:gain" },
    ];
    const client = { listRuntimeAuditRecords: async () => records } as unknown as RuntimeActionClient;
    const { unmount } = render(<BloomDebugPanel client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh audit" }));
    await waitFor(() => expect(status()).toBe("2 audit records loaded."));
    const auditCard = screen.getByRole("region", { name: "Runtime audit" });
    fireEvent.click(within(auditCard).getByRole("button", { name: "Show" }));
    const [first, second] = within(auditCard).getAllByRole("listitem");
    expect(first).toHaveTextContent("Refused by policy ×3");
    expect(second).toHaveTextContent("/cartesian_manager:gain");
    unmount();

    render(<BloomDebugPanel client={{ listRuntimeAuditRecords: async () => [] } as unknown as RuntimeActionClient} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh audit" }));
    await waitFor(() => expect(status()).toBe("No runtime audit records yet."));
  });

  it("names a failed start or stop and keeps the recording state it had", async () => {
    const { client } = backend();
    const broken = {
      ...client,
      listRuntimeAuditRecords: async () => {
        throw new Error("audit offline");
      },
      startRuntimeRecording: async () => {
        throw new BloomApiError("Bad request", 400, JSON.stringify({ detail: "Topic not allowed." }));
      },
    } as unknown as RuntimeActionClient;
    render(<BloomDebugPanel client={broken} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh topics" }));
    await waitFor(() => expect(status()).toBe("3 topics available."));
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(status()).toBe("Bad request Topic not allowed."));
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh audit" }));
    await waitFor(() => expect(status()).toBe("audit offline"));
  });
});

/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeKioskBar } from "./RuntimeKioskBar";
import { useSwitchScanning } from "./use-switch-scanning";

HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

const PERIOD_MS = 600;
const drive: ScreenConfig = {
  id: "drive",
  title: "Drive",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [],
};
const application = {
  id: "explorer-manager",
  name: "Explorer Manager",
  screens: [drive],
} as unknown as ApplicationConfig;
const bench = { id: "bench", layoutId: "drive_bench", menuOnTap: true, name: "Bench" };

const handlers = () => ({
  onBackToBuilder: vi.fn(),
  onEditApplication: vi.fn(),
  onEditScreen: vi.fn(),
  onLanguageChange: vi.fn(),
  onOpenAppLibrary: vi.fn(),
  onOpenHelp: vi.fn(),
  onOpenLanding: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenSupervisor: vi.fn(),
  onOpenTour: vi.fn(),
  onReload: vi.fn(),
  onSelectScreen: vi.fn(),
  onSuspendTeleop: vi.fn(),
});

// The workspace scanner walks the whole view, the kiosk bar included.
function ScannedBar(props: ReturnType<typeof handlers>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useSwitchScanning({ enabled: true, periodMs: PERIOD_MS, rootRef, revision: 0 });
  return (
    <div ref={rootRef}>
      <RuntimeKioskBar
        application={application}
        commandFrameId="base_link"
        profile={bench}
        profiles={[bench]}
        scanning={{ enabled: true, periodMs: PERIOD_MS }}
        screen={drive}
        {...props}
      />
    </div>
  );
}

// Every control the highlight rests on over a few whole cycles.
function litOverCycles(): Set<string> {
  const seen = new Set<string>();
  for (let tick = 0; tick < 60; tick += 1) {
    const lit = document.querySelector<HTMLElement>("[data-scan-lit]");
    if (lit) {
      seen.add((lit.getAttribute("aria-label") ?? lit.textContent ?? "").trim());
    }
    act(() => vi.advanceTimersByTime(PERIOD_MS));
  }
  return seen;
}

describe("controls that leave for a page with no scanner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("never lights Back to Builder under scan, and a caregiver's tap still works", () => {
    const props = handlers();
    render(<ScannedBar {...props} />);

    const seen = litOverCycles();
    expect(seen.size).toBeGreaterThan(0);
    expect(seen).not.toContain("Back to Builder");

    fireEvent.click(screen.getByRole("button", { name: "Back to Builder" }));
    expect(props.onBackToBuilder).toHaveBeenCalledOnce();
  });

  it("never lights Supervisor mirror on the maintenance sheet under scan, and says so", () => {
    render(<ScannedBar {...handlers()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open maintenance" }));
    expect(screen.getByRole("dialog", { name: "Maintenance" })).toBeTruthy();

    const seen = litOverCycles();
    expect(seen).toContain("Practice");
    expect(seen).not.toContain("Supervisor mirror");
    expect(screen.getByText(/Supervisor mirror, Edit, Help and Home are not scanned/)).toBeTruthy();
  });
});

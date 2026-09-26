/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeStopControl } from "./RuntimeStopControl";

// What a browser does with a key on the focused button: Enter clicks on keydown (repeats included), Space on keyup.
function nativeKeyDown(key: string, repeat = false) {
  const target = document.activeElement as HTMLElement;
  const notPrevented = fireEvent.keyDown(target, { key, repeat });
  if (notPrevented && key === "Enter" && target instanceof HTMLButtonElement) {
    fireEvent.click(target, { detail: 0 });
  }
}

function nativeKeyUp(key: string) {
  const target = document.activeElement as HTMLElement;
  const notPrevented = fireEvent.keyUp(target, { key });
  if (notPrevented && key === " " && target instanceof HTMLButtonElement) {
    fireEvent.click(target, { detail: 0 });
  }
}

function Harness({ onEngage }: { onEngage: () => void }) {
  const [stopped, setStopped] = useState(true);
  return (
    <RuntimeStopControl
      onEngage={() => {
        onEngage();
        setStopped(true);
      }}
      onResume={() => setStopped(false)}
      requestError=""
      stopped={stopped}
    />
  );
}

describe("a keyboard Resume handing focus to STOP", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function holdResume(key: string) {
    const onEngage = vi.fn();
    render(<Harness onEngage={onEngage} />);
    screen.getByRole("button", { name: /Hold for one second to resume/ }).focus();
    nativeKeyDown(key);
    for (let tick = 0; tick < 12; tick += 1) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
      nativeKeyDown(key, true);
    }
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop the robot" }));
    return onEngage;
  }

  it("does not stop on the auto-repeat of the Enter that resumed", () => {
    const onEngage = holdResume("Enter");

    nativeKeyDown("Enter", true);
    nativeKeyDown("Enter", true);
    nativeKeyUp("Enter");

    expect(onEngage).not.toHaveBeenCalled();
    nativeKeyDown("Enter");
    expect(onEngage).toHaveBeenCalledOnce();
  });

  it("does not stop on the release of the Space that resumed", () => {
    const onEngage = holdResume(" ");

    nativeKeyUp(" ");

    expect(onEngage).not.toHaveBeenCalled();
    nativeKeyDown(" ");
    nativeKeyUp(" ");
    expect(onEngage).toHaveBeenCalledOnce();
  });
});

describe("a keyboard STOP", () => {
  afterEach(cleanup);

  function StopHarness({ onEngage }: { onEngage: () => void }) {
    const [stopped, setStopped] = useState(false);
    return (
      <RuntimeStopControl
        onEngage={() => {
          onEngage();
          setStopped(true);
        }}
        onResume={() => setStopped(false)}
        requestError=""
        stopped={stopped}
      />
    );
  }

  it.each([" ", "Enter"])("stops on the %j press, not its release, and only once", (key) => {
    const onEngage = vi.fn();
    render(<StopHarness onEngage={onEngage} />);
    screen.getByRole("button", { name: "Stop the robot" }).focus();

    nativeKeyDown(key);
    expect(onEngage).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Hold for one second to resume/ }));

    nativeKeyDown(key, true);
    nativeKeyUp(key);
    expect(onEngage).toHaveBeenCalledOnce();
  });
});

it("still stops on a scan click after a keyboard STOP and a Resume", () => {
  const onEngage = vi.fn();
  const view = (stopped: boolean) => (
    <RuntimeStopControl onEngage={onEngage} onResume={vi.fn()} requestError="" stopped={stopped} />
  );
  const { rerender } = render(view(false));
  screen.getByRole("button", { name: "Stop the robot" }).focus();
  nativeKeyDown(" ");
  rerender(view(true));
  rerender(view(false));

  fireEvent.click(screen.getByRole("button", { name: "Stop the robot" }), { detail: 0 });
  expect(onEngage).toHaveBeenCalledTimes(2);
  cleanup();
});

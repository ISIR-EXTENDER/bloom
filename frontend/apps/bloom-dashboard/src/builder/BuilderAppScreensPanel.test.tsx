/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BuilderAppScreensPanel } from "./BuilderAppScreensPanel";
import { createStarterScreen } from "./builder-starters";

const noop = () => undefined;

function Harness() {
  const [screens, setScreens] = useState<ScreenConfig[]>([{ ...createStarterScreen("blank", false), title: "Drive" }]);
  return (
    <>
      <BuilderAppScreensPanel
        isDirty={false}
        isSaving={false}
        newScreenDevice="tablet"
        newScreenName="New screen"
        onAddScreen={noop}
        onAddScreenById={noop}
        onCreateScreen={noop}
        onDuplicateScreen={noop}
        onMoveScreenBefore={noop}
        onNewScreenDeviceChange={noop}
        onNewScreenNameChange={noop}
        onOpenScreenBuilder={noop}
        onRemoveScreen={noop}
        onRenameScreen={(screenId, title) =>
          setScreens((current) => current.map((item) => (item.id === screenId ? { ...item, title } : item)))
        }
        onReorderScreen={noop}
        screens={screens}
        unassignedScreens={[]}
      />
      <output>{screens[0]?.title}</output>
    </>
  );
}

describe("the screens in an app", () => {
  afterEach(cleanup);

  // A screen kept the name it was created with: nothing on the card could change it.
  it("can be renamed from their card", () => {
    render(<Harness />);
    const title = screen.getByLabelText("Screen title") as HTMLInputElement;

    fireEvent.change(title, { target: { value: "Drive the arm" } });
    expect(screen.getByRole("status").textContent).toBe("Drive the arm");
    expect(screen.getByRole("button", { name: "Open Drive the arm screen builder" })).toBeTruthy();

    fireEvent.change(title, { target: { value: "" } });
    fireEvent.blur(title);
    expect(screen.getByRole("status").textContent).toBe("Untitled screen");
  });
});

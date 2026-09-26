/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Crash(): never {
  throw new Error("boom");
}

describe("a crashed view", () => {
  afterEach(cleanup);

  // The dispatcher sits above the boundary, so a held pad kept streaming behind an error text.
  it("releases the controls and offers a way out", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();
    const onOpenHome = vi.fn();
    render(
      <AppErrorBoundary onError={onError} onOpenHome={onOpenHome} resetKey="runtime">
        <Crash />
      </AppErrorBoundary>,
    );

    expect(onError).toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("boom");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(onOpenHome).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

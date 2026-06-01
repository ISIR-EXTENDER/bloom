import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the dashboard foundation", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: /robot interfaces that grow cleanly/i })).toBeVisible();
    expect(screen.getByText(/configurable robot teleoperation/i)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Architecture promises" })).toBeVisible();
  });

  it("renders the first workflow cards", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 2, name: "Configure" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Control" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Observe" })).toBeVisible();
  });
});

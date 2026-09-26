/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RequiredTextInput } from "./RequiredTextInput";

function Harness() {
  const [title, setTitle] = useState("Gripper");
  return (
    <>
      <RequiredTextInput aria-label="Title" fallback="Untitled widget" onCommit={setTitle} value={title} />
      <output>{title}</output>
    </>
  );
}

describe("a name that must not be saved empty", () => {
  afterEach(cleanup);

  // Clearing the field used to put "Untitled widget" in it, and the next letter gave "Untitled widgetG".
  it("lets the author clear it and type a new one", () => {
    render(<Harness />);
    const field = screen.getByLabelText("Title") as HTMLInputElement;

    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("Untitled widget");

    fireEvent.change(field, { target: { value: "G" } });
    expect(field.value).toBe("G");
    expect(screen.getByRole("status").textContent).toBe("G");
  });

  it("shows the fallback once the author leaves it empty", () => {
    render(<Harness />);
    const field = screen.getByLabelText("Title") as HTMLInputElement;

    fireEvent.change(field, { target: { value: " " } });
    fireEvent.blur(field);

    expect(field.value).toBe("Untitled widget");
  });
});

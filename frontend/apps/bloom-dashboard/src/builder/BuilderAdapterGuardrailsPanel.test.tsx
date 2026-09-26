/**
 * @vitest-environment jsdom
 */
import { DEFAULT_RUNTIME_POLICY, type RuntimeAdapterPolicy } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { parseLines } from "./app-config-model";
import { BuilderAdapterGuardrailsPanel } from "./BuilderAdapterGuardrailsPanel";

function Harness() {
  const [policy, setPolicy] = useState<RuntimeAdapterPolicy>({ ...DEFAULT_RUNTIME_POLICY, allowed_service_calls: [] });
  return (
    <>
      <BuilderAdapterGuardrailsPanel
        commandFrameUnavailable={false}
        onCommandFrameChange={() => undefined}
        onPolicyListChange={(field, value) => setPolicy((current) => ({ ...current, [field]: parseLines(value) }))}
        onSyncFromPresets={() => setPolicy((current) => ({ ...current, allowed_service_calls: ["/synced"] }))}
        policy={policy}
        runtimeCapabilityReport={null}
      />
      <output>{JSON.stringify(policy.allowed_service_calls)}</output>
    </>
  );
}

describe("the adapter guardrail lists", () => {
  afterEach(cleanup);

  // Each keystroke rebuilt the text from the parsed list, so a new line vanished before the author could fill it.
  it("keeps a typed new line while the list saves the parsed values", () => {
    render(<Harness />);
    const field = screen.getByLabelText("Allowed service calls") as HTMLTextAreaElement;

    fireEvent.change(field, { target: { value: "/a\n" } });
    expect(field.value).toBe("/a\n");
    expect(screen.getByRole("status").textContent).toBe('["/a"]');

    fireEvent.change(field, { target: { value: "/a\n/b" } });
    expect(screen.getByRole("status").textContent).toBe('["/a","/b"]');
  });

  it("shows a list changed from outside the field", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Sync publish guardrails from presets" }));
    expect((screen.getByLabelText("Allowed service calls") as HTMLTextAreaElement).value).toBe("/synced");
  });

  it("says what an empty list means for each list", () => {
    render(<Harness />);
    expect(screen.getByText("Empty: every joystick in this app is refused.")).toBeTruthy();
    expect(screen.getByText("Empty: this app tunes no parameter.")).toBeTruthy();
    expect(screen.queryByText(/unrestricted local demos/)).toBeNull();
  });
});

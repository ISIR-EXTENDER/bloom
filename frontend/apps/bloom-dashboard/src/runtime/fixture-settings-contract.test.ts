import { normalizeWidgetSettings } from "@bloom/widgets";
import { describe, expect, it } from "vitest";

/**
 * Every widget in every shipped app must satisfy its own settings contract.
 *
 * A widget whose settings fail validation does not fail loudly: it renders
 * normally, and then `createWidgetActionIntent` returns an "unsupported" intent
 * and the press publishes nothing. That is how four buttons on the Explorer
 * Manager app -- Both, Jaco, Go home and Release -- sat dead in the UI while
 * every test passed, because `action_feedback` was set to "toast", which was
 * never one of the allowed values.
 *
 * A button that looks live and does nothing is the worst failure mode this app
 * has, so it is worth a test that reads the real shipped configs -- both the
 * bundles that ship to teammates and the test-only fixtures.
 */
type AppBundle = {
  applications?: { id: string; screens?: { id: string; widgets?: unknown[] }[] }[];
};

const bundles = Object.entries(
  import.meta.glob<AppBundle>(
    ["../../../../../backend/seed/applications/*.json", "../../../../../tests/fixtures/*.json"],
    { eager: true, import: "default" },
  ),
).filter(([, bundle]) => Array.isArray(bundle.applications) && bundle.applications.length > 0);

function widgetsOf(bundle: AppBundle) {
  const found: { app: string; screen: string; widget: Record<string, unknown> }[] = [];
  for (const application of bundle.applications ?? []) {
    for (const screen of application.screens ?? []) {
      for (const widget of screen.widgets ?? []) {
        found.push({ app: application.id, screen: screen.id, widget: widget as Record<string, unknown> });
      }
    }
  }
  return found;
}

describe("shipped widget settings", () => {
  it("covers every app bundle fixture", () => {
    expect(bundles.length).toBeGreaterThan(0);
  });

  for (const [path, bundle] of bundles) {
    it(`are valid in ${path.split("/").pop()}`, () => {
      const failures = widgetsOf(bundle)
        .map(({ app, screen, widget }) => {
          const result = normalizeWidgetSettings(
            widget.kind as never,
            (widget.settings ?? {}) as Record<string, unknown>,
          );
          if (result.success) {
            return null;
          }
          const reasons = result.errors.map((error) => `${error.field}: ${error.message}`).join("; ");
          return `${app}/${screen}/${widget.id}(${widget.kind}): ${reasons}`;
        })
        .filter((entry): entry is string => entry !== null);

      expect(failures).toEqual([]);
    });
  }
});

import { BloomApiError } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import { describeApiError } from "./api-error";

describe("what a refused save tells the author", () => {
  // A team authoring apps without help gets one chance to understand a refusal. "status 422" is not it.
  it("carries the server's reason, not just the status line", () => {
    const error = new BloomApiError(
      "Bloom API request failed with status 422",
      422,
      JSON.stringify({ detail: "widget drive-z overlaps the reserved stop region" }),
    );

    expect(describeApiError(error, "fallback")).toContain("overlaps the reserved stop region");
  });

  it("joins the field messages of a validation error", () => {
    const error = new BloomApiError(
      "Bloom API request failed with status 422",
      422,
      JSON.stringify({ detail: [{ msg: "name is too short" }, { msg: "id must be a plain key" }] }),
    );

    const described = describeApiError(error, "fallback");
    expect(described).toContain("name is too short");
    expect(described).toContain("id must be a plain key");
  });

  it("falls back when there is nothing to add", () => {
    expect(describeApiError(new Error("offline"), "fallback")).toBe("offline");
    expect(describeApiError("not an error", "fallback")).toBe("fallback");
  });
});

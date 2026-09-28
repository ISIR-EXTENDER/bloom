// One coverage shape for every frontend package: run vitest per package, never from the frontend root.
// Thresholds are floors about two points under what each package held on 2026-09-28; a drop below them fails
// the run. Raise a floor when a package gains ground, never lower one to let a change through.

/**
 * @param {{ lines: number, branches: number }} thresholds
 */
export function coverage(thresholds) {
  return {
    provider: "v8",
    include: ["src/**/*.{ts,tsx}"],
    exclude: [
      "src/**/*.test.{ts,tsx}",
      "src/**/test-support/**",
      "src/test/**",
      "src/**/generated/**",
      "src/**/*.stories.{ts,tsx}",
      "src/**/*.d.ts",
    ],
    reporter: ["text-summary", "json-summary", "lcov"],
    reportsDirectory: "./coverage",
    thresholds,
  };
}

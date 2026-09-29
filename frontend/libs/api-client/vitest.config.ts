import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest-coverage.mjs";

export default defineConfig({
  test: {
    coverage: coverage({ lines: 95, branches: 88 }),
  },
});

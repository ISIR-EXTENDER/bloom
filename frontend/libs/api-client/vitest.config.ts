import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest-coverage.mjs";

export default defineConfig({
  test: {
    coverage: coverage({ lines: 71, branches: 69 }),
  },
});

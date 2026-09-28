import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest-coverage.mjs";

export default defineConfig({
  test: {
    coverage: coverage({ lines: 84, branches: 75 }),
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { coverage } from "../../vitest-coverage.mjs";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: coverage({ lines: 98, branches: 83 }),
  },
});

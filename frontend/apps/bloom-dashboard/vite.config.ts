import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { coverage } from "../../vitest-coverage.mjs";

const apiProxyTarget = process.env.VITE_BLOOM_API_PROXY_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: coverage({ lines: 93, branches: 87 }),
  },
});

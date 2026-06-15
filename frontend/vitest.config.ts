import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Frontend test harness (code-constitution frontend-remediation, T0).
// Minimal by design: the React plugin for JSX/TSX, jsdom for the DOM, a shared
// setup file, and the same `@/` alias the app uses. CSS imports are disabled
// (no-op) so tests don't drag in the Tailwind pipeline.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    clearMocks: true,
  },
});

import { defineConfig } from "vitest/config";

// Standalone Vitest config so tests do not load the React Router Vite plugin
// from vite.config.ts (which expects a running app/server context).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});

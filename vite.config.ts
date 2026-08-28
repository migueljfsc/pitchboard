import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 5173,
  },
  test: {
    // The engine is pure and framework-free, so the default node environment
    // is all it needs — no jsdom, no canvas polyfill. render.ts is tested via
    // a recording proxy context (see src/board/render.test.ts).
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 5173,
  },
  // The export worker's own dependencies, pre-bundled when the dev server starts.
  // Found late instead — on the first export — Vite re-optimises them mid-session,
  // and a worker then asks for the bundle by its old hash, gets an error, and fails
  // to start while the page carries on as if nothing happened.
  optimizeDeps: {
    include: ["mediabunny", "gifenc"],
  },
  test: {
    // The engine is pure and framework-free, so the default node environment
    // is all it needs — no jsdom, no canvas polyfill. render.ts is tested via
    // a recording proxy context (see src/board/render.test.ts).
    environment: "node",
    // The Worker's pure helpers — cookie parsing, the renewal predicate — are the same
    // kind of small numerical logic the engine tests, and `pnpm test` gates the deploy.
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
  },
}));

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves project sites from a subpath, but dev should stay at the
  // root so the local URL is just localhost:5173. Overridable so a future
  // root-domain deploy needs no code change.
  base: command === "build" ? (process.env.PITCHBOARD_BASE ?? "/pitchboard/") : "/",
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
    // The Worker's pure helpers — cookie parsing, the renewal predicate — are the same
    // kind of small numerical logic the engine tests, and `pnpm test` gates the deploy.
    include: ["src/**/*.test.ts", "infrastructure/worker/**/*.test.ts"],
  },
}));

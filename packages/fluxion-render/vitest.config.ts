import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/test/**",
        "src/index.ts",
        "src/react.ts",
        "src/app/worker/fluxion-worker.ts",
        // Browser-only Worker factory (`new URL(import.meta.url)`) — untestable in node.
        "src/app/worker/create-worker-factory.ts",
      ],
      // Statements / functions / lines are held at a literal 100%. Branches sit
      // at 98: the shortfall is entirely v8's phantom "implicit else" branch on
      // every `if` without an `else` (reported with no source location, so it
      // can neither be tested nor `/* v8 ignore */`-d). Every real branch is
      // covered or has a documented ignore.
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 98,
      },
    },
  },
});

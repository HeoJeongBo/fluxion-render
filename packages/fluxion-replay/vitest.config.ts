import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // Bench files are picked up by `vitest bench` only. Exclude here so a
    // plain `vitest run` doesn't try to execute them as regular tests.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.bench.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    benchmark: {
      include: ["src/**/*.bench.{ts,tsx}"],
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/test/**",
        "src/index.ts",
        "src/react.ts",
      ],
      thresholds: {
        lines: 100,
        statements: 90,
        branches: 85,
        functions: 90,
      },
    },
  },
});

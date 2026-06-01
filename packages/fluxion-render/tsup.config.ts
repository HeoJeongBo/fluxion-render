import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
    testing: "src/testing/index.ts",
    "fluxion-worker": "src/app/worker/fluxion-worker.ts",
    worker: "src/worker.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["react"],
});

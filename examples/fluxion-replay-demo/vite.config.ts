import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // fluxion-replay: resolve from source so Vite can tree-shake and HMR
      { find: "@heojeongbo/fluxion-replay/react", replacement: path.resolve(__dirname, "../../packages/fluxion-replay/src/react.ts") },
      { find: "@heojeongbo/fluxion-replay", replacement: path.resolve(__dirname, "../../packages/fluxion-replay/src/index.ts") },
      // fluxion-render: must use pre-built dist so the Worker URL resolves correctly
      { find: "@heojeongbo/fluxion-render/react", replacement: path.resolve(__dirname, "../../packages/fluxion-render/dist/react.js") },
      { find: "@heojeongbo/fluxion-render", replacement: path.resolve(__dirname, "../../packages/fluxion-render/dist/index.js") },
    ],
  },
  server: {
    port: 5174,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: [
        path.resolve(__dirname, "../.."),
      ],
    },
  },
});

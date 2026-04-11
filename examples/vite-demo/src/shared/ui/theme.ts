/**
 * Light-mode palette for the demo app.
 *
 * All colors are centralized here so every page/component imports from the
 * same source. Flip a value here and the whole app follows — the only other
 * place colors live is `index.html` for the initial page paint.
 *
 * The `chart.*` values are intended to be passed to the library (both to
 * `FluxionHostOptions.bgColor` and to `AxisGridConfig` {gridColor, axisColor,
 * labelColor}), so canvas content is consistent with surrounding UI.
 *
 * Series data colors (#4fc3f7, #80ffa0, #ffb060) are still set per-layer in
 * each demo — they're bright accents that read well on any background.
 */
export const THEME = {
  page: {
    background: "#f8f9fb",
    border: "#e3e6ec",
    textPrimary: "#1b1f2a",
    textSecondary: "#5a6a80",
    textMuted: "#8592a8",
  },
  button: {
    background: "#4a6db8",
    text: "#ffffff",
    border: "#4a6db8",
    inactiveBackground: "transparent",
    inactiveText: "#1b1f2a",
    inactiveBorder: "#e3e6ec",
  },
  panel: {
    background: "#ffffff",
    border: "#e3e6ec",
  },
  chart: {
    canvasBg: "#ffffff",
    gridColor: "rgba(0,0,0,0.08)",
    axisColor: "rgba(0,0,0,0.4)",
    labelColor: "rgba(0,0,0,0.7)",
  },
} as const;

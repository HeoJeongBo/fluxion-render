/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "app-bg": "#0f1117",
        "app-panel": "#1a1d27",
        "app-border": "#2a2d3a",
        "app-text": "#e2e8f0",
        "app-sub": "#8892a4",
        "app-muted": "#555e70",
        "app-accent": "#4f8ef7",
        "app-red": "#f87171",
        "app-green": "#4ade80",
        "app-yellow": "#fbbf24",
        "app-purple": "#c084fc",
      },
      fontFamily: {
        sans: ["-apple-system", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

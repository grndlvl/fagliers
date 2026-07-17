/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      colors: {
        // Brand green from the Faglier's MMA logo (#6CBD45).
        // `deep` is contrast-safe for text on light backgrounds (>4.5:1).
        brand: { DEFAULT: "#6CBD45", dark: "#4F9E2E", deep: "#2F6A1E", glow: "#8FD861" },
        // Warm near-black used for text and the dramatic dark bands.
        ink: { DEFAULT: "#14160F", soft: "#1B1E15", muted: "#5B6052" },
        // Light, warm "paper" surfaces.
        paper: { DEFAULT: "#FAFAF6", mist: "#F1F2EC", line: "#E4E5DC" },
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      maxWidth: { "8xl": "88rem" },
    },
  },
  plugins: [],
};

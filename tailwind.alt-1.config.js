/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./alt-1/index.html"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#6CBD45", dark: "#4F9E2E", deep: "#3A7A22", glow: "#92DC63" },
        ink: { DEFAULT: "#0A0C09", soft: "#12150F", card: "#181C13", line: "#2B3322" },
      },
      fontFamily: {
        display: ["'Bebas Neue'", "Oswald", "sans-serif"],
        head: ["'Barlow Condensed'", "sans-serif"],
        body: ["Barlow", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};


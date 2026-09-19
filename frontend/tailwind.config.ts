import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        flux: {
          red: "#FC0019",
          "red-dark": "#D40016",
          "red-light": "#FF4D5E",
          black: "#0A0A0A",
          dark: "#111111",
          gray: "#1A1A1A",
          "gray-light": "#2A2A2A",
          muted: "#8A8F98",
          border: "#242424",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(252, 0, 25, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;

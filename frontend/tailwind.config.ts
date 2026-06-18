import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── RTD Primary ──────────────────────────────────────────────────
        "rtd-red":      "#CE0E2D",
        "rtd-blue":     "#002F87",
        // ── RTD Secondary ────────────────────────────────────────────────
        "rtd-orange":   "#F6871F",
        "rtd-gold":     "#FDBA2F",
        "rtd-midblue":  "#41C1EF",
        "rtd-darkred":  "#852E2C",
        "rtd-teal":     "#009483",
        // ── Rail line colours (tertiary) ─────────────────────────────────
        "rtd-a":        "#54C0E8",
        "rtd-b":        "#4C9C2E",
        "rtd-d":        "#047835",
        "rtd-e":        "#691F74",
        "rtd-ff":       "#003595",
        "rtd-g":        "#F4B223",
        "rtd-h":        "#0055B8",
        "rtd-l":        "#FFCD00",
        "rtd-n":        "#904199",
        "rtd-r":        "#C1D32F",
        "rtd-w":        "#0091B3",
        // ── UI surface ───────────────────────────────────────────────────
        "surface":      "#0F1923",
        "surface-card": "#1A2535",
        "surface-border":"#263040",
      },
    },
  },
  plugins: [],
};

export default config;

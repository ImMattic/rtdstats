import type { Config } from "tailwindcss";

/** Semantic token backed by a CSS variable (space-separated RGB triple). */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // `dark:` variants key off the <html data-theme="dark"> attribute set by the
  // no-flash script in app/layout.tsx, so they compose with the token system
  // for the occasional one-off override.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── RTD Primary ──────────────────────────────────────────────────
        "rtd-red": "#CE0E2D",
        "rtd-blue": "#002F87",
        // ── RTD Secondary ────────────────────────────────────────────────
        "rtd-orange": "#F6871F",
        "rtd-gold": "#FDBA2F",
        "rtd-midblue": "#41C1EF",
        "rtd-darkred": "#852E2C",
        "rtd-teal": "#009483",
        // ── Rail line colours (tertiary) ─────────────────────────────────
        "rtd-a": "#54C0E8",
        "rtd-b": "#4C9C2E",
        "rtd-d": "#047835",
        "rtd-e": "#691F74",
        "rtd-ff": "#003595",
        "rtd-g": "#F4B223",
        "rtd-h": "#0055B8",
        "rtd-l": "#FFCD00",
        "rtd-n": "#904199",
        "rtd-r": "#C1D32F",
        "rtd-w": "#0091B3",

        // ── Semantic theme tokens (light + dark via CSS vars) ────────────
        canvas: token("canvas"),
        card: {
          DEFAULT: token("card"),
          muted: token("card-muted"),
        },
        line: token("line"),
        fg: {
          DEFAULT: token("fg"),
          muted: token("fg-muted"),
          subtle: token("fg-subtle"),
        },
        accent: {
          DEFAULT: token("accent"),
          contrast: token("accent-contrast"),
          red: token("accent-red"),
        },
        ok: token("ok"),
        warn: token("warn"),
        danger: token("danger"),

        // ── Back-compat aliases (old names, now themed) ──────────────────
        surface: token("canvas"),
        "surface-card": token("card"),
        "surface-border": token("line"),
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        display: [
          "var(--font-inter-tight)",
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      borderRadius: {
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};

export default config;

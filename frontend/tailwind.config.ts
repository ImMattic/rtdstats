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
        // ── Theme surfaces (CSS-var backed — flip with data-theme) ────────
        // "Last Train" (dark, default) / "First Train" (light) — see globals.css.
        canvas:     "rgb(var(--canvas) / <alpha-value>)",
        card:       "rgb(var(--card) / <alpha-value>)",
        raised:     "rgb(var(--raised) / <alpha-value>)",
        overlay:    "rgb(var(--overlay) / <alpha-value>)",
        line:       "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-2) / <alpha-value>)",
        fg:         "rgb(var(--fg) / <alpha-value>)",
        "fg-muted": "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-subtle":"rgb(var(--fg-subtle) / <alpha-value>)",
        // Signal accent triad — interactive / good / attention / critical.
        accent:       "rgb(var(--accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
        ok:           "rgb(var(--ok) / <alpha-value>)",
        warn:         "rgb(var(--warn) / <alpha-value>)",
        danger:       "rgb(var(--danger) / <alpha-value>)",
        // ── Legacy aliases — old dark-only names kept working ─────────────
        "surface":       "rgb(var(--canvas) / <alpha-value>)",
        "surface-card":  "rgb(var(--card) / <alpha-value>)",
        "surface-border":"rgb(var(--line) / <alpha-value>)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;

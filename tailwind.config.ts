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
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          subtle: "var(--brand-subtle)",
          muted: "var(--brand-soft)",
        },
        canvas: "var(--surface-0)",
        surface: {
          DEFAULT: "var(--surface-2)",
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        elevated: "var(--surface-3)",
        foreground: "var(--text-primary)",
        muted: {
          DEFAULT: "var(--text-secondary)",
          faint: "var(--text-faint)",
        },
        border: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        status: {
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          danger: "var(--status-danger)",
          info: "var(--status-info)",
        },
      },
      fontFamily: {
        sans: ["Barlow", "system-ui", "-apple-system", "sans-serif"],
        condensed: ["Barlow Condensed", "Barlow", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["2.75rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "700" }],
        title: ["1rem", { lineHeight: "1.35", fontWeight: "600" }],
        label: ["0.75rem", { lineHeight: "1.4", fontWeight: "500" }],
        value: ["0.875rem", { lineHeight: "1.4", fontWeight: "600" }],
        caption: ["0.6875rem", { lineHeight: "1.35", fontWeight: "500" }],
      },
      spacing: {
        gutter: "var(--space-gutter)",
        section: "var(--space-section)",
      },
      borderRadius: {
        panel: "var(--radius-panel)",
        input: "var(--radius-input)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
      },
      transitionTimingFunction: {
        instrument: "var(--ease-out)",
      },
      keyframes: {
        "result-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "value-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.72" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "result-in": "result-in var(--duration-normal) var(--ease-out)",
        "value-pulse": "value-pulse 600ms var(--ease-out) 1",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;

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
          DEFAULT: "#E8761A",
          hover: "#d06510",
          muted: "rgba(232, 118, 26, 0.12)",
        },
        canvas: "#1C1917",
        surface: "#111111",
        elevated: "#1a1a1a",
        foreground: "#F5EFE6",
      },
      fontFamily: {
        sans: ["Barlow", "system-ui", "-apple-system", "sans-serif"],
        condensed: ["Barlow Condensed", "Barlow", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

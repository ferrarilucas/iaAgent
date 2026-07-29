import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        navy: {
          50: "#eef3f8",
          100: "#d7e2ee",
          200: "#a9c1da",
          300: "#759cbf",
          400: "#3f6f9e",
          500: "#2b5c85",
          600: "#1e4a70",
          700: "#163a5b",
          800: "#102a44",
          900: "#0c2036",
          950: "#071726",
        },
        gold: {
          50: "#faf5e9",
          100: "#f3e9d3",
          200: "#e7d3a7",
          300: "#dcc38f",
          400: "#d4b878",
          500: "#c6a15b",
          600: "#b8934a",
          700: "#98783c",
          800: "#7a6131",
        },
        cream: {
          50: "#faf8f3",
          100: "#f5f1e8",
          200: "#ece5d6",
          300: "#ddd3bd",
        },
        ink: {
          DEFAULT: "#16273a",
          muted: "#5b6b7b",
          soft: "#8595a3",
        },
        success: { DEFAULT: "#2f8f5b", soft: "#e3f3ea" },
        danger: { DEFAULT: "#c2453f", soft: "#f8e3e2" },
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 42, 68, 0.04), 0 8px 24px -12px rgba(16, 42, 68, 0.16)",
        "card-hover": "0 2px 4px rgba(16, 42, 68, 0.06), 0 16px 40px -16px rgba(16, 42, 68, 0.24)",
        soft: "0 1px 2px rgba(16, 42, 68, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;

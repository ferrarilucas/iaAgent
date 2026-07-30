import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        line: "var(--line)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        soft: "var(--soft)",
        accent: {
          DEFAULT: "var(--accent)",
          fg: "var(--accent-fg)",
          soft: "var(--accent-soft)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
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
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.1rem",
        "3xl": "1.6rem",
      },
    },
  },
  plugins: [],
};

export default config;

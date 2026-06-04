import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1a2b4a",
          50: "#f3f5f9",
          100: "#e2e8f1",
          200: "#c6d2e3",
          300: "#9bb0cd",
          400: "#6985b0",
          500: "#476497",
          600: "#374f7d",
          700: "#2e4066",
          800: "#293856",
          900: "#1a2b4a",
          950: "#101a30",
        },
        accent: {
          DEFAULT: "#f57c1f",
          50: "#fef6ee",
          100: "#fde9d4",
          200: "#fad0a8",
          300: "#f7b071",
          400: "#f57c1f",
          500: "#f06717",
          600: "#e14f0f",
          700: "#bb3a10",
          800: "#952f14",
          900: "#782a14",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)",
        soft: "0 4px 24px -4px rgb(16 26 48 / 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;

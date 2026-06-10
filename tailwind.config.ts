import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1a2b4a",
          50: "#f3f5f9",
          100: "#e2e7f0",
          200: "#c2cde0",
          300: "#94a8c7",
          400: "#5f7ca9",
          500: "#3d5d8e",
          600: "#2d4876",
          700: "#253b60",
          800: "#1a2b4a",
          900: "#14213a",
          950: "#0d1626",
        },
        accent: {
          DEFAULT: "#e8762d",
          50: "#fdf5ef",
          100: "#fae8d9",
          200: "#f4cdb2",
          300: "#eeab80",
          400: "#e8762d",
          500: "#dd6420",
          600: "#c84f17",
          700: "#a63d16",
          800: "#853219",
          900: "#6c2b17",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(13, 22, 38, 0.08), 0 4px 16px rgba(13, 22, 38, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15121a",
        plum: "#1f1a27",
        surface: "#2a2333",
        line: "#3a3145",
        paper: "#f3ece4",
        muted: "#a99fb3",
        rose: "#f27d98",
        roseDeep: "#c9536f",
        gold: "#e6c27a",
        mint: "#8fd3b6",
      },
      fontFamily: {
        display: ["'Iowan Old Style'", "'Palatino Linotype'", "Palatino", "Georgia", "serif"],
        body: ["ui-sans-serif", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(242,125,152,0.35), 0 12px 40px -12px rgba(242,125,152,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;

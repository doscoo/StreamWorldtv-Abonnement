import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1116",
        panel: "#161B22",
        line: "#232A34",
        accent: "#4F8CFF",
        accent2: "#7CE0C6",
        warn: "#F2B84B",
        danger: "#F2685B",
        muted: "#8A94A6",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
      },
    },
  },
  plugins: [],
} satisfies Config;

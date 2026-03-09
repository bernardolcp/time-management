import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tempo: {
          bg: "#faf9f5",
          surface: "#f5f0e8",
          border: "#e8e6dc",
          muted: "#b0aea5",
          text: "#141413",
          accent: "#d97757",
          "accent-light": "#f0d8cc",
          olive: "#788c5d",
          "olive-light": "#dce4d3",
          blue: "#6a9bcc",
          "blue-light": "#d4e3f0",
          journal: "#5a5856",
        },
      },
      fontFamily: {
        display: ["'Instrument Serif'", "serif"],
        body: ["'Crimson Text'", "serif"],
        ui: ["'DM Sans'", "sans-serif"],
        accent: ["'Caveat'", "cursive"],
      },
    },
  },
  plugins: [],
};
export default config;

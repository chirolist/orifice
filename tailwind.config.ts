import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07101c",
        panel: "#10192a",
        panel2: "#172338",
        line: "#2c3e5c",
        mist: "#9aabc4",
        foam: "#e8f0ff",
        tide: "#5eb0ff",
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Noto Sans JP"', '"Hiragino Sans"', "Meiryo", "sans-serif"],
        mono: ['"Cascadia Code"', '"SFMono-Regular"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

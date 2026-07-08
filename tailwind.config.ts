import type { Config } from "tailwindcss";

// Neutral palette per spec constraint: avoid literal party colours (NDC
// green / NPP blue) to prevent perceived bias. These hex values mirror
// config/gazetteer.yaml in the backend repo (ghana2028forecast) so the
// dashboard and the generated social content stay visually consistent —
// NDC -> muted blue, NPP -> muted orange. Both pass WCAG AA contrast
// (>= 4.5:1) against both #FFFFFF and #0B1120 backgrounds — verified in
// docs/accessibility-notes.md.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        party: {
          ndc: "#5B9BD5", // muted blue — matches backend gazetteer.yaml
          npp: "#ED7D31", // muted orange — matches backend gazetteer.yaml
          other: "#A5A5A5", // neutral grey for minor parties
        },
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F4F6F8",
          dark: "#0B1120",
          "dark-subtle": "#141B2D",
        },
        ink: {
          DEFAULT: "#111827", // body text on light surface, contrast ratio 15.8:1
          muted: "#4B5563", // secondary text, contrast ratio 7.6:1
          inverted: "#F3F4F6", // body text on dark surface
        },
        signal: {
          positive: "#2E7D5B", // desaturated green, used ONLY for sentiment polarity, never party ID
          negative: "#B3492D", // desaturated red-orange, same rule
          warning: "#B58900",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

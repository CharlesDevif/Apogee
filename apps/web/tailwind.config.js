/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Major Mono Display"', "ui-monospace", "monospace"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        ghost: ['"Syne Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        void: "#04070a",
        graphite: "#0a1014",
        panel: "#0d1419",
        rail: "#0f181f",
        border: "#1c2c38",
        seam: "#274050",
        phosphor: "#ffb700",
        phosphorDim: "#8a6300",
        jade: "#7dffb1",
        jadeDim: "#3a8859",
        alert: "#ff4d3d",
        ink: "#c9d6df",
        dim: "#43576a",
        deep: "#283845",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        flicker: {
          "0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%": {
            opacity: "1",
          },
          "20%, 21.999%, 63%, 63.999%, 65%, 69.999%": {
            opacity: "0.55",
          },
        },
        blink: {
          "0%, 50%": { opacity: "1" },
          "50.01%, 100%": { opacity: "0" },
        },
        sweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        boot: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse_dot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.35", transform: "scale(0.92)" },
        },
      },
      animation: {
        scan: "scan 7s linear infinite",
        flicker: "flicker 4.5s infinite",
        blink: "blink 1.1s steps(1, end) infinite",
        sweep: "sweep 8s linear infinite",
        boot: "boot 0.45s ease-out forwards",
        pulseDot: "pulse_dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

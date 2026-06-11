/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#fff1f1",
          100: "#ffe0e0",
          200: "#ffc5c5",
          300: "#ff9d9d",
          400: "#ff6464",
          500: "#f83535",
          600: "#e51414",
          700: "#c10c0c",
          800: "#a00e0e",
          900: "#841313",
          950: "#480404",
        },
      },
      boxShadow: {
        "card":       "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
        "modal":      "0 20px 60px -10px rgb(0 0 0 / 0.25)",
        "top":        "0 1px 0 0 rgb(0 0 0 / 0.06)",
      },
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "toast-in": {
          "0%":   { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in":  "fade-in 0.18s ease-out",
        "slide-in": "slide-in 0.22s cubic-bezier(0.16,1,0.3,1)",
        "slide-up": "slide-up 0.18s ease-out",
        "toast-in": "toast-in 0.22s ease-out",
      },
    },
  },
  plugins: [],
};

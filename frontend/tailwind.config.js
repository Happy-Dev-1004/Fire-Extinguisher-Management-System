/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff1f1",
          100: "#ffe0e0",
          500: "#dc2626",
          600: "#b91c1c",
          700: "#991b1b",
        },
      },
    },
  },
  plugins: [],
};

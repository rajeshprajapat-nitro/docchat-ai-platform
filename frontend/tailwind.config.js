/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f5ff",
          100: "#e6ebff",
          500: "#4f5bff",
          600: "#3f47e0",
          700: "#3138b3",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

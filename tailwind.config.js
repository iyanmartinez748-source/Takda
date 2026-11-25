/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Formalizes the .font-display class that App.jsx previously
      // defined by hand via an inline <style> tag — same font, same
      // fallback, now a real Tailwind/JIT-recognized utility instead of
      // a plain CSS class that happened to exist. Inter/Plus Jakarta
      // Sans are left out of this config on purpose: they're already
      // applied via explicit `font-family` on body/specific elements,
      // not through Tailwind's `font-sans`, and font-sans is not used
      // anywhere in this codebase today — changing it would be an
      // unrelated, unauthorized global change.
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

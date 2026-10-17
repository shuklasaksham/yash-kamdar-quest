import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages (any repo name) or any static host.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
  },
});

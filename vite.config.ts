import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // About-окно показывает живую версию из манифеста (не хардкод).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        // Bell №2: chat windows are a separate module — not built by default.
        comments: resolve(__dirname, "comments.html"),
        playlist: resolve(__dirname, "playlist.html"),
        about: resolve(__dirname, "about.html"),
      },
    },
  },
  server: {
    port: 1424,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

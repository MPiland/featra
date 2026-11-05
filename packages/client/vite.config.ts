import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

/** The built app runs from file:// inside Electron, so it gets a strict CSP. Dev keeps Vite's inline HMR preamble. */
const productionCsp = (): Plugin => ({
  name: "featra-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      },
      injectTo: "head-prepend",
    },
  ],
});

export default defineConfig({
  base: "./",
  plugins: [react(), productionCsp()],
  server: { port: 5174, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, target: "esnext" },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});

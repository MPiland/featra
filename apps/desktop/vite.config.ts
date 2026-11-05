import { defineConfig } from "vitest/config";

/**
 * Bundles Electron main (`vite build`) and preload (`vite build --mode preload`) into CommonJS, one self-contained
 * file each: a sandboxed preload can only require "electron", so it must not share chunks with main.
 */
export default defineConfig(({ mode }) => {
  const entry = mode === "preload" ? "preload" : "main";
  return {
    build: {
      ssr: `src/${entry}.ts`,
      outDir: "dist",
      emptyOutDir: entry === "main",
      target: "node22",
      minify: false,
      rollupOptions: {
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
    ssr: { noExternal: ["@featra/client"] },
    test: {
      include: ["test/**/*.test.ts"],
    },
  };
});

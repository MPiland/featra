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
    // Main runs from dist/ without the workspace: bundle the TypeScript packages and their dependencies.
    ssr: { noExternal: ["@featra/client", "@featra/work-format", "yaml"] },
    test: {
      include: ["test/**/*.test.ts"],
    },
  };
});

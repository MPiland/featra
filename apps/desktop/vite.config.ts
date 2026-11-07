import { defineConfig } from "vitest/config";

/**
 * Bundles Electron main (`vite build`), preload (`vite build --mode preload`) and the local server
 * (`vite build --mode server`) into CommonJS, one self-contained file each: a sandboxed preload can only require
 * "electron", so it must not share chunks with main; the server runs as its own process (ADR 0015).
 */
const ENTRIES = {
  main: "src/main.ts",
  preload: "src/preload.ts",
  server: "../../packages/server/src/main.ts",
} as const;

export default defineConfig(({ mode }) => {
  const entry = mode === "preload" || mode === "server" ? mode : "main";
  return {
    build: {
      ssr: ENTRIES[entry],
      outDir: "dist",
      emptyOutDir: entry === "main",
      target: "node22",
      minify: false,
      rollupOptions: {
        // ws loads these optional native speed-ups only if they are installed; Featra doesn't ship them.
        external: ["electron", "bufferutil", "utf-8-validate"],
        output: { format: "cjs", entryFileNames: `${entry}.cjs` },
      },
    },
    // Main and the server run from dist/ without the workspace: bundle the TypeScript packages and their dependencies.
    ssr: { noExternal: ["@featra/client", "@featra/work-format", "@featra/server", "yaml", "ws"] },
    test: {
      include: ["test/**/*.test.ts"],
    },
  };
});

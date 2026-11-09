import { defineConfig } from "vitest/config";

/**
 * Bundles Electron main (`vite build`), preload (`vite build --mode preload`) and the local server
 * (`vite build --mode server`) and the Featra MCP agents are given (`vite build --mode mcp`) into CommonJS, one self-contained file each: a sandboxed preload can only require
 * "electron", so it must not share chunks with main; the server runs as its own process (ADR 0015).
 */
const ENTRIES = {
  main: "src/main.ts",
  preload: "src/preload.ts",
  server: "../../packages/server/src/main.ts",
  mcp: "../../packages/mcp/src/main.ts",
} as const;

export default defineConfig(({ mode }) => {
  const entry = mode === "preload" || mode === "server" || mode === "mcp" ? mode : "main";
  return {
    build: {
      ssr: ENTRIES[entry],
      outDir: "dist",
      emptyOutDir: entry === "main",
      target: "node22",
      minify: false,
      rollupOptions: {
        // ws loads these optional native speed-ups only if they are installed; Featra doesn't ship them. The Agent SDK
        // is ESM and spawns its own files, so the server imports it from node_modules when a chat starts (ADR 0018).
        external: ["electron", "bufferutil", "utf-8-validate", "@anthropic-ai/claude-agent-sdk"],
        output: { format: "cjs", entryFileNames: `${entry}.cjs` },
      },
    },
    // Main and the server run from dist/ without the workspace: bundle the TypeScript packages and their dependencies.
    ssr: {
      noExternal: [
        "@featra/client",
        "@featra/work-format",
        "@featra/server",
        "@featra/mcp",
        "@modelcontextprotocol/sdk",
        "yaml",
        "ws",
      ],
    },
    test: {
      include: ["test/**/*.test.ts"],
    },
  };
});

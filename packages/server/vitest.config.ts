import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Setup builds real git repositories: dozens of git starts, up to about 1 s each under the full run (BUG-6).
    hookTimeout: 30000,
  },
});

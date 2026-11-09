import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each stdio test starts a real Node process and a real server.
    testTimeout: 30000,
  },
});

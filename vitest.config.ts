import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/work-format", "packages/client", "apps/desktop", "tooling"],
  },
});

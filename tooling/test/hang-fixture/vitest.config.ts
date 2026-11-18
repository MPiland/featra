import { defineConfig } from "vitest/config";
import { HANG_GUARD } from "../../hang-guard.ts";

/** A run of tests that hang, for `wait-report.test.ts` (BUG-30): the same settings every project gets. */
export default defineConfig({
  root: import.meta.dirname,
  test: { ...HANG_GUARD, include: ["*.hang.ts"], reporters: ["default"] },
});

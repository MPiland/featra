import { defineConfig } from "vitest/config";
import { HANG_GUARD } from "../../tooling/hang-guard.ts";

export default defineConfig({ test: { ...HANG_GUARD } });

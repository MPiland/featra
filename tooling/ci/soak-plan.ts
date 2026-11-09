import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * What a soak run repeats, where, and how often. `suite` is the Electron e2e suite or the whole `pnpm test:unit` run
 * (BUG-6). For e2e, `specs` empty means the whole suite; the unit suite always runs whole.
 */
export interface SoakPlan {
  suite: "e2e" | "unit";
  platform: "windows" | "ubuntu";
  specs: string[];
  runs: number;
}

const SPEC = /^[A-Za-z0-9._-]+$/;

function plan(suite: string, platform: string, specs: string[], runs: string): SoakPlan {
  if (suite !== "e2e" && suite !== "unit") throw new Error(`suite must be e2e or unit, not "${suite}"`);
  if (suite === "unit" && specs.length > 0) throw new Error("the unit suite takes no specs; it always runs whole");
  if (platform !== "windows" && platform !== "ubuntu") {
    throw new Error(`platform must be windows or ubuntu, not "${platform}"`);
  }
  if (!/^[1-9][0-9]*$/.test(runs)) throw new Error(`runs must be a positive whole number, not "${runs}"`);
  const bad = specs.find((s) => !SPEC.test(s));
  if (bad !== undefined) throw new Error(`spec names may use letters, digits, ".", "_" and "-" only, not "${bad}"`);
  return { suite, platform, specs, runs: Number(runs) };
}

/**
 * Reads a soak branch name: `soak/<platform>/<specs>/<runs>`. `<specs>` is `all` for the whole suite, or spec names
 * without `.spec.ts`, joined by `+`, or `unit` for the whole unit suite. For example `soak/windows/tray/150`,
 * `soak/ubuntu/tray+menu/20` or `soak/windows/unit/50`.
 */
export function soakFromBranch(branch: string): SoakPlan {
  const parts = branch.split("/");
  const [head, platform = "", specs = "", runs = ""] = parts;
  if (parts.length !== 4 || head !== "soak") {
    throw new Error(`a soak branch is named soak/<platform>/<specs>/<runs>, not "${branch}"`);
  }
  if (specs === "unit") return plan("unit", platform, [], runs);
  const names = specs === "all" ? [] : specs.split("+").map((s) => `${s}.spec.ts`);
  return plan("e2e", platform, names, runs);
}

/** Reads the Actions tab's inputs: spec file names separated by spaces (empty for the whole suite), and the suite. */
export function soakFromInputs(spec: string, platform: string, runs: string, suite = "e2e"): SoakPlan {
  return plan(suite, platform, spec.split(/\s+/).filter(Boolean), runs);
}

function main(): void {
  const env = process.env;
  const soak =
    env.GITHUB_EVENT_NAME === "workflow_dispatch"
      ? soakFromInputs(env.SPEC ?? "", env.PLATFORM ?? "", env.RUNS ?? "", env.SUITE || "e2e")
      : soakFromBranch(env.GITHUB_REF_NAME ?? "");
  const lines = [
    `suite=${soak.suite}`,
    `platform=${soak.platform}`,
    `specs=${soak.specs.join(" ")}`,
    `runs=${soak.runs}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

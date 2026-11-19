/**
 * The release workflow's first job (STORY-65): `node tooling/release/plan.ts` reads the app's version and the run
 * from GitHub's environment, fails when a pushed tag doesn't match the version, and writes the plan to the job's
 * outputs (`version`, `tag`, `prerelease`, `publish`) for the jobs after it.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planRelease, type ReleasePlan } from "./version.ts";

/** apps/desktop/package.json: the one place the app's version is kept (ADR 0040). */
export const APP_MANIFEST = join(import.meta.dirname, "..", "..", "apps", "desktop", "package.json");

export function appVersion(manifest = APP_MANIFEST): string {
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  const version = typeof parsed === "object" && parsed !== null && "version" in parsed ? parsed.version : undefined;
  if (typeof version !== "string") throw new Error(`${manifest} has no version.`);
  return version;
}

/** The plan as `key=value` lines, the form GITHUB_OUTPUT takes. */
export const planOutputs = (plan: ReleasePlan): string =>
  [`version=${plan.version}`, `tag=${plan.tag}`, `prerelease=${plan.prerelease}`, `publish=${plan.publish}`, ""].join(
    "\n",
  );

function main(): void {
  const env = process.env;
  try {
    const plan = planRelease(
      { event: env.GITHUB_EVENT_NAME ?? "", refType: env.GITHUB_REF_TYPE ?? "", refName: env.GITHUB_REF_NAME ?? "" },
      appVersion(),
    );
    process.stdout.write(planOutputs(plan));
    process.stdout.write(
      plan.publish
        ? `Publishing ${plan.tag}${plan.prerelease ? " as a pre-release" : ""} once every installer passes.\n`
        : `Dry run: builds and tests ${plan.tag}'s installers, and publishes nothing.\n`,
    );
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, planOutputs(plan));
  } catch (error) {
    // An annotation on the run's summary, as well as the log.
    process.stdout.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

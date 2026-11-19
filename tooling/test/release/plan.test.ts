/**
 * STORY-65: the release workflow's Plan job, run as the workflow runs it (`node tooling/release/plan.ts`), against the
 * app's real version. Only GitHub's environment is made up.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APP_MANIFEST, appVersion } from "../../release/plan.ts";
import { isPrerelease } from "../../release/version.ts";
import { REPO } from "../run.ts";

const PLAN = join(REPO, "tooling", "release", "plan.ts");
const VERSION = appVersion();
let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function plan(github: Record<string, string>) {
  dir = mkdtempSync(join(tmpdir(), "featra-plan-"));
  const output = join(dir, "output");
  const { GITHUB_OUTPUT: _, ...env } = process.env;
  const result = spawnSync(process.execPath, [PLAN], {
    cwd: REPO,
    env: { ...env, ...github, GITHUB_OUTPUT: output },
    encoding: "utf8",
  });
  let outputs = "";
  try {
    outputs = readFileSync(output, "utf8");
  } catch {
    // No outputs written: the plan failed.
  }
  return { status: result.status, stdout: result.stdout, outputs };
}

describe("the release workflow's Plan job (STORY-65)", () => {
  it("reads the version from apps/desktop/package.json", () => {
    expect(APP_MANIFEST).toBe(join(REPO, "apps", "desktop", "package.json"));
    expect(VERSION).toBe(JSON.parse(readFileSync(APP_MANIFEST, "utf8")).version);
  });

  it("publishes a pushed tag that matches the app's version, as a pre-release while it is 0.x", () => {
    const { status, outputs } = plan({
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: `v${VERSION}`,
    });
    expect(status).toBe(0);
    // The rule itself is version.test.ts's; here, the job hands it on.
    expect(outputs).toBe(`version=${VERSION}\ntag=v${VERSION}\nprerelease=${isPrerelease(VERSION)}\npublish=true\n`);
  });

  it("fails, naming both versions, when the pushed tag doesn't match, and writes no plan", () => {
    const { status, stdout, outputs } = plan({
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: "v99.0.0",
    });
    expect(status).toBe(1);
    expect(stdout).toContain(
      `::error::The tag v99.0.0 is version 99.0.0, but the app's version is ${VERSION} (apps/desktop/package.json).`,
    );
    expect(outputs).toBe("");
  });

  it("plans a dry run that publishes nothing for a manual run", () => {
    const { status, stdout, outputs } = plan({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_TYPE: "branch",
      GITHUB_REF_NAME: "main",
    });
    expect(status).toBe(0);
    expect(outputs).toContain("publish=false\n");
    expect(stdout).toContain(`Dry run: builds and tests v${VERSION}'s installers, and publishes nothing.`);
  });
});

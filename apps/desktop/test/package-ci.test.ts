/**
 * STORY-64: CI's package jobs, one per platform, build the installer with `pnpm package`, install it and launch the
 * installed app (e2e/installed), and upload the installer and the smoke test's JUnit report. Read from the workflows themselves: the jobs are in package.yml, which ci.yml calls on every pull
 * request and the release workflow calls before it publishes (STORY-65).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installerFiles, type InstallerPlatform } from "../packaging/config.ts";
import { readManifest } from "../packaging/modules.ts";
import { REPO, workflow, workflowJob } from "../../../tooling/test/run.ts";

const JOBS: { platform: string; os: InstallerPlatform; runner: string }[] = [
  { platform: "windows", os: "win32", runner: "windows-2025" },
  { platform: "ubuntu", os: "linux", runner: "ubuntu-24.04" },
  { platform: "macos", os: "darwin", runner: "macos-15" },
];
const { version: VERSION } = await readManifest(join(REPO, "apps", "desktop"));

/** The paths an upload step names, from its `path:` line or block. */
function uploadPaths(job: string, artifact: string): string[] {
  const step = new RegExp(String.raw`with:\n\s+name: ${artifact}\n\s+path: (\|\n(?:\s{12}\S.*\n)+|.*\n)`).exec(job);
  const path = step?.[1] ?? "";
  return path.startsWith("|")
    ? path
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean)
    : [path.trim()];
}

const escape = (s: string) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Whether a file name matches an upload glob's last part (`*` is any run of characters). */
const matches = (glob: string, file: string) =>
  new RegExp(`^${glob.split("/").at(-1)!.split("*").map(escape).join(".*")}$`).test(file);

/** A workflow's job names: its checks, or for a called workflow the second half of each check's name. */
const names = (file: string) => [...workflow(file).matchAll(/^ {2}[\w-]+:\n {4}name: (.+)$/gm)].map((m) => m[1]!);

describe("CI's package jobs (STORY-64)", () => {
  it("run on each platform: build the installer, then install it and launch the installed app", () => {
    // CI runs them on every pull request.
    expect(workflowJob("ci.yml", "package")).toMatch(/^ {4}uses: \.\/\.github\/workflows\/package\.yml\n/m);
    for (const { platform, runner } of JOBS) {
      const job = workflowJob("package.yml", `package-${platform}`);
      expect(job, platform).toMatch(new RegExp(String.raw`^ {4}runs-on: ${runner}\n`, "m"));
      expect(job, platform).toMatch(/- uses: \.\/\.github\/actions\/setup\n\s+with:\n\s+e2e: "true"\n/);
      expect(job, platform).toMatch(/- name: Build the installer\n(\s+shell: bash\n)?\s+run: pnpm package\n/);
      expect(job, platform).toMatch(/run: (tooling\/e2e\/xvfb\.sh )?pnpm test:installed\n/);
      expect(job, platform).toMatch(new RegExp(String.raw`FEATRA_JUNIT: test-report/package-${platform}\.xml\n`));
    }
    expect(workflowJob("package.yml", "package-ubuntu")).toMatch(/APPIMAGE_EXTRACT_AND_RUN: "1"\n/);
    expect(workflowJob("package.yml", "package-macos")).toMatch(
      /softwareupdate --install-rosetta --agree-to-license\n/,
    );
    // electron-builder skips signing a pull request's build unless told to; the ad-hoc signature needs no secret.
    expect(workflowJob("package.yml", "package-macos")).toMatch(
      /run: pnpm package\n\s+env:\n(\s+#.*\n)*\s+CSC_FOR_PULL_REQUEST: "true"\n/,
    );
  });

  it("upload each platform's installer, the smoke test's report, and a failed run's traces", () => {
    for (const { platform, os } of JOBS) {
      const job = workflowJob("package.yml", `package-${platform}`);
      const paths = uploadPaths(job, `installer-${platform}`);
      expect(
        paths.every((p) => p.startsWith("apps/desktop/out/installers/")),
        platform,
      ).toBe(true);
      // AC7: every installer pnpm package builds there, and nothing else.
      for (const file of installerFiles(os, VERSION))
        expect(
          paths.some((p) => matches(p, file)),
          file,
        ).toBe(true);
      expect(paths, platform).toHaveLength(installerFiles(os, VERSION).length);
      expect(uploadPaths(job, `test-report-package-${platform}`), platform).toEqual(["test-report"]);
      expect(uploadPaths(job, `package-${platform}-traces`), platform).toEqual(["apps/desktop/test-results"]);
    }
  });

  it("are not among main's required checks, as the workflow and docs/testing.md list them", () => {
    const header = workflow("ci.yml").split("\nname: CI")[0]!;
    expect(header).toContain("Gate, E2E (Windows), E2E (Ubuntu)");
    expect(header).not.toContain("Package");
    // The checks are the jobs' names; the docs list the required ones, each a job, none a package job. A called
    // workflow's checks are named for the calling job and its own: "Installers / Package (Windows)".
    const jobNames = names("ci.yml");
    const packageNames = JOBS.map(
      ({ platform }) => /^ {4}name: (.+)$/m.exec(workflowJob("package.yml", `package-${platform}`))?.[1],
    );
    expect(packageNames.every((name) => name !== undefined && names("package.yml").includes(name))).toBe(true);
    packageNames.push(/^ {4}name: (.+)$/m.exec(workflowJob("ci.yml", "package"))?.[1]);
    expect(packageNames.at(-1)).toBe("Installers");
    const docs = readFileSync(join(REPO, "docs", "testing.md"), "utf8").replaceAll(/\s+/g, " ");
    const required = /Branch protection on main requires (.+?), plus/.exec(docs)?.[1]?.split(/, | and /);
    expect(required).toEqual(["Gate", "E2E (Windows)", "E2E (Ubuntu)"]);
    for (const name of required ?? []) expect(jobNames).toContain(name);
    for (const name of packageNames) {
      expect(required).not.toContain(name);
      expect(header).not.toContain(name);
    }
  });
});

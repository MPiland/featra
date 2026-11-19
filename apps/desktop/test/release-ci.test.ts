/**
 * STORY-65: the release workflow (release.yml), read from the workflow itself. It checks the tag first, runs the same
 * package jobs as CI (package.yml) and publishes in a last job that needs them all, only for a pushed tag.
 */
import { describe, expect, it } from "vitest";
import { workflow, workflowJob } from "../../../tooling/test/run.ts";

const PLATFORMS = ["windows", "ubuntu", "macos"];
const release = () => workflow("release.yml");
const job = (name: string) => workflowJob("release.yml", name);
/** A job's `needs`, as a list. */
const needs = (name: string) =>
  (/^ {4}needs: (?:\[(.*)\]|(\S+))$/m.exec(job(name)) ?? []).slice(1).find(Boolean)?.split(/,\s*/) ?? [];
/** The name of a workflow's `package` job, the job that calls package.yml. */
const caller = (file: string) => /^ {4}name: (.+)$/m.exec(workflowJob(file, "package"))?.[1];
const jobIds = (file: string) =>
  [...(workflow(file).split("\njobs:\n")[1] ?? "").matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]);

describe("the release workflow (STORY-65)", () => {
  it("runs on a pushed v tag, by hand, and on a pull request that changes the release", () => {
    const on = release().split("\non:\n")[1]!.split(/\n\S/)[0]!;
    expect(on).toContain('  push:\n    tags: ["v*"]\n');
    expect(on).toContain("  workflow_dispatch:\n");
    expect(on).toMatch(/ {2}pull_request:\n {4}paths:\n(?: {6}- .+\n)+/);
    for (const path of [".github/workflows/release.yml", ".github/workflows/package.yml", "tooling/release/**"])
      expect(on).toContain(`      - ${path}\n`);
    // Nothing else starts it: not a branch push, nor a schedule.
    expect(on).not.toMatch(/branches|schedule/);
  });

  it("checks the tag against the app's version before anything is built", () => {
    expect(jobIds("release.yml")).toEqual(["plan", "package", "notes", "publish"]);
    expect(needs("plan")).toEqual([]);
    expect(job("plan")).toMatch(
      /- name: Check the tag against the app's version\n\s+id: plan\n\s+run: node tooling\/release\/plan\.ts\n/,
    );
    expect(job("plan")).not.toMatch(/\.github\/actions\/setup\b|pnpm/);
    for (const output of ["version", "tag", "prerelease", "publish"])
      expect(job("plan")).toContain(`      ${output}: \${{ steps.plan.outputs.${output} }}\n`);
    expect(needs("package")).toEqual(["plan"]);
  });

  it("builds and smoke-tests every platform's installer with CI's own package jobs", () => {
    // One copy of the package jobs, which CI and the release both call.
    expect(job("package")).toMatch(/^ {4}uses: \.\/\.github\/workflows\/package\.yml$/m);
    expect(workflowJob("ci.yml", "package")).toMatch(/^ {4}uses: \.\/\.github\/workflows\/package\.yml$/m);
    expect(workflow("package.yml")).toMatch(/^on:\n {2}workflow_call:\n/m);
    for (const file of ["ci.yml", "release.yml"]) expect(workflow(file), file).not.toContain("pnpm package");
    for (const platform of PLATFORMS) {
      expect(jobIds("package.yml")).toContain(`package-${platform}`);
      expect(workflowJob("package.yml", `package-${platform}`)).toContain(`name: installer-${platform}\n`);
    }
  });

  it("names its package checks apart from CI's, since a pull request that changes the release runs both", () => {
    // A called workflow's checks are "<caller's name> / <job's name>".
    expect(caller("release.yml")).toBe("Release installers");
    expect(caller("ci.yml")).toBe("Installers");
  });

  it("uploads each installer so a re-run of a failed package job can upload it again", () => {
    for (const platform of PLATFORMS) {
      const packageJob = workflowJob("package.yml", `package-${platform}`);
      const upload = packageJob.split(`name: installer-${platform}\n`)[1]?.split("- name:")[0] ?? "";
      expect(upload, platform).toMatch(/^ {10}overwrite: true$/m);
    }
  });

  it("publishes only from a pushed tag, in a last job that needs every smoke test to have passed", () => {
    expect(needs("notes")).toEqual(["plan", "package"]);
    expect(needs("publish")).toEqual(["plan", "package", "notes"]);
    expect(job("publish")).toMatch(/^ {4}if: success\(\) && needs\.plan\.outputs\.publish == 'true'$/m);
    expect(job("publish")).toMatch(/- name: Publish the release\n\s+run: node tooling\/release\/publish\.ts\n/);
    // The only job that can write to the repo, and the only one that publishes.
    expect(release()).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(job("publish")).toMatch(/^ {4}permissions:\n {6}contents: write$/m);
    for (const other of ["plan", "notes"]) {
      expect(job(other), other).not.toMatch(/contents: write|publish\.ts|gh release/);
    }
    expect(workflow("package.yml")).not.toMatch(/contents: write|gh release/);
    // The write token is gh's alone: the publish job's checkout keeps no credentials in git.
    expect(job("publish")).toMatch(/- uses: actions\/checkout@v4\n\s+with:\n\s+persist-credentials: false\n/);
  });

  it("attaches every installer and writes the notes and checksums, in a dry run too", () => {
    const downloadsInstallers =
      /uses: actions\/download-artifact@v4\n\s+with:\n\s+pattern: installer-\*\n\s+path: installers\n\s+merge-multiple: true\n/;
    for (const name of ["notes", "publish"]) expect(job(name), name).toMatch(downloadsInstallers);
    expect(job("notes")).toMatch(/fetch-depth: 0\n\s+fetch-tags: true\n/);
    expect(job("notes")).toMatch(/run: node tooling\/release\/prepare\.ts\n/);
    expect(job("notes")).not.toMatch(/^ {4}if:/m);
    expect(job("notes")).toContain("name: release-notes\n");
    expect(job("publish")).toMatch(/name: release-notes\n\s+path: release\n/);
  });
});

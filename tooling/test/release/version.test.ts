import { describe, expect, it } from "vitest";
import { checkTag, compareVersions, isPrerelease, parseVersion, planRelease } from "../../release/version.ts";

const v = (text: string) => parseVersion(text)!;
const tagPush = (tag: string) => ({ event: "push", refType: "tag", refName: tag });

describe("the release a tag makes (STORY-65)", () => {
  it("publishes a pushed vX.Y.Z tag that matches the app's version", () => {
    expect(planRelease(tagPush("v1.2.3"), "1.2.3")).toEqual({
      version: "1.2.3",
      tag: "v1.2.3",
      prerelease: false,
      publish: true,
    });
  });

  it("marks 0.x releases as pre-releases, and any version with a pre-release part", () => {
    expect(planRelease(tagPush("v0.1.0"), "0.1.0")).toMatchObject({ prerelease: true, publish: true });
    expect(isPrerelease("0.9.12")).toBe(true);
    expect(isPrerelease("0.1.0-rc.1")).toBe(true);
    expect(isPrerelease("1.0.0-rc.1")).toBe(true);
    expect(isPrerelease("1.0.0")).toBe(false);
    expect(isPrerelease("2.3.4")).toBe(false);
  });

  it("fails, naming both versions, when the tag doesn't match the app's version", () => {
    expect(() => planRelease(tagPush("v0.2.0"), "0.1.0")).toThrow(
      "The tag v0.2.0 is version 0.2.0, but the app's version is 0.1.0 (apps/desktop/package.json). " +
        "Tag v0.1.0, or change the version in a pull request first.",
    );
    expect(() => checkTag("v0.1.0-rc.1", "0.1.0")).toThrow(/version 0\.1\.0-rc\.1, but the app's version is 0\.1\.0/);
    expect(() => checkTag("v0.1.0", "0.1.0-rc.1")).toThrow(/version 0\.1\.0, but the app's version is 0\.1\.0-rc\.1/);
  });

  it("fails on a tag that isn't v and a version", () => {
    for (const tag of ["0.1.0", "v0.1", "vnext", "v01.0.0", "v0.1.0+build.5", "release-0.1.0"])
      expect(() => planRelease(tagPush(tag), "0.1.0"), tag).toThrow(
        `The tag ${tag} isn't a release tag. Release tags are v and the app's version, like v0.1.0.`,
      );
  });

  it("is a dry run, publishing nothing, when started by hand or by a pull request", () => {
    const dry = { version: "0.1.0", tag: "v0.1.0", prerelease: true, publish: false };
    expect(planRelease({ event: "workflow_dispatch", refType: "branch", refName: "main" }, "0.1.0")).toEqual(dry);
    // A manual run from a tag is still a dry run, even when the tag doesn't match.
    expect(planRelease({ event: "workflow_dispatch", refType: "tag", refName: "v9.9.9" }, "0.1.0")).toEqual(dry);
    expect(planRelease({ event: "pull_request", refType: "branch", refName: "80/merge" }, "0.1.0")).toEqual(dry);
  });

  it("refuses an app version that isn't SemVer", () => {
    expect(() => planRelease(tagPush("v1.0"), "1.0")).toThrow(
      "The app's version 1.0 isn't a SemVer version, like 0.1.0.",
    );
  });
});

describe("SemVer precedence, for the last release before a tag (STORY-65)", () => {
  it("orders by major, minor and patch as numbers, and a pre-release before its version", () => {
    const sorted = ["1.0.0", "0.10.0", "0.2.0", "0.2.0-rc.2", "0.2.0-rc.10", "0.2.0-beta", "0.2.0-rc", "0.1.0"]
      .map(v)
      .toSorted(compareVersions)
      .map((x) => `${x.major}.${x.minor}.${x.patch}${x.pre.length ? `-${x.pre.join(".")}` : ""}`);
    expect(sorted).toEqual([
      "0.1.0",
      "0.2.0-beta",
      "0.2.0-rc",
      "0.2.0-rc.2",
      "0.2.0-rc.10",
      "0.2.0",
      "0.10.0",
      "1.0.0",
    ]);
  });

  it("puts numeric pre-release identifiers before text ones", () => {
    expect(compareVersions(v("1.0.0-1"), v("1.0.0-alpha"))).toBeLessThan(0);
    expect(compareVersions(v("1.0.0"), v("1.0.0"))).toBe(0);
  });
});

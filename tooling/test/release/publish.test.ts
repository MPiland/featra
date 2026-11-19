import { describe, expect, it } from "vitest";
import { checkTagCommit, publishSteps, releaseState, taggedCommit } from "../../release/publish.ts";

const input = {
  repo: "o/r",
  notesFile: "release/notes.md",
  files: ["installers/Featra-0.1.0-x64-setup.exe", "release/SHA256SUMS.txt"],
};
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);

describe("publishing a release with gh (STORY-65)", () => {
  it("creates the release for the pushed tag as a draft with every file, then publishes it, a pre-release for 0.x", () => {
    expect(publishSteps({ ...input, tag: "v0.1.0", version: "0.1.0", existing: "none" })).toEqual([
      [
        "release",
        "create",
        "v0.1.0",
        "--repo",
        "o/r",
        "--verify-tag",
        "--draft",
        "--title",
        "Featra 0.1.0",
        "--notes-file",
        "release/notes.md",
        "--prerelease",
        "installers/Featra-0.1.0-x64-setup.exe",
        "release/SHA256SUMS.txt",
      ],
      ["release", "edit", "v0.1.0", "--repo", "o/r", "--draft=false", "--prerelease"],
    ]);
  });

  it("finishes a draft a failed run left: uploads every file again, replacing any, then publishes it", () => {
    expect(publishSteps({ ...input, tag: "v0.1.0", version: "0.1.0", existing: "draft" })).toEqual([
      [
        "release",
        "upload",
        "v0.1.0",
        "--repo",
        "o/r",
        "--clobber",
        "installers/Featra-0.1.0-x64-setup.exe",
        "release/SHA256SUMS.txt",
      ],
      [
        "release",
        "edit",
        "v0.1.0",
        "--repo",
        "o/r",
        "--title",
        "Featra 0.1.0",
        "--notes-file",
        "release/notes.md",
        "--draft=false",
        "--prerelease",
      ],
    ]);
  });

  it("fails, changing nothing, when the tag's release is already published", () => {
    expect(() => publishSteps({ ...input, tag: "v0.1.0", version: "0.1.0", existing: "published" })).toThrow(
      "The release v0.1.0 is already published, so nothing was changed. To publish it again, delete it on the " +
        "Releases page first.",
    );
  });

  it("makes a 1.0 or later release the latest one, not a pre-release", () => {
    for (const existing of ["none", "draft"] as const) {
      const steps = publishSteps({ ...input, tag: "v1.0.0", version: "1.0.0", existing });
      const publish = steps.at(-1) ?? [];
      expect(publish, existing).toContain("--draft=false");
      expect(publish, existing).toContain("--latest");
      expect(steps.flat(), existing).not.toContain("--prerelease");
    }
    const rc = publishSteps({ ...input, tag: "v1.0.0-rc.1", version: "1.0.0-rc.1", existing: "none" });
    expect(rc.at(-1)).toContain("--prerelease");
  });

  it("refuses a tag that isn't the app's version, so nothing is published for it", () => {
    expect(() => publishSteps({ ...input, tag: "v0.2.0", version: "0.1.0", existing: "none" })).toThrow(
      /The tag v0\.2\.0 is version 0\.2\.0, but the app's version is 0\.1\.0/,
    );
  });

  it("reads whether the tag's release is missing, a draft or published", () => {
    expect(releaseState(null)).toBe("none");
    expect(releaseState('{"isDraft":true}')).toBe("draft");
    expect(releaseState('{"isDraft":false}')).toBe("published");
  });
});

describe("the commit a release tag names (STORY-65)", () => {
  it("is the tag's own commit, read through an annotated tag to the commit it points at", () => {
    const lightweight = `${SHA}\trefs/tags/v0.1.0\n`;
    expect(taggedCommit(lightweight, "v0.1.0")).toBe(SHA);
    const annotated = `${OTHER}\trefs/tags/v0.1.0\n${SHA}\trefs/tags/v0.1.0^{}\n`;
    expect(taggedCommit(annotated, "v0.1.0")).toBe(SHA);
    expect(taggedCommit(`${SHA}\trefs/tags/v0.1.0-rc.1\n`, "v0.1.0")).toBeNull();
    expect(taggedCommit("", "v0.1.0")).toBeNull();
  });

  it("must be the commit that was built and tested, or nothing is published", () => {
    expect(() => checkTagCommit("v0.1.0", SHA, SHA)).not.toThrow();
    expect(() => checkTagCommit("v0.1.0", OTHER, SHA)).toThrow(
      `The tag v0.1.0 now names ${OTHER}, but this run built and tested ${SHA}. Nothing was published.`,
    );
    expect(() => checkTagCommit("v0.1.0", null, SHA)).toThrow(
      `The tag v0.1.0 isn't on GitHub, so nothing was published.`,
    );
  });
});

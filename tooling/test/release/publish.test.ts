import { describe, expect, it } from "vitest";
import { publishArgs } from "../../release/publish.ts";

const input = {
  repo: "o/r",
  notesFile: "release/notes.md",
  files: ["installers/Featra-0.1.0-x64-setup.exe", "release/SHA256SUMS.txt"],
};

describe("publishing a release with gh (STORY-65)", () => {
  it("creates the release for the pushed tag, with its notes, installers and checksums, as a pre-release for 0.x", () => {
    expect(publishArgs({ ...input, tag: "v0.1.0", version: "0.1.0" })).toEqual([
      "release",
      "create",
      "v0.1.0",
      "--repo",
      "o/r",
      "--verify-tag",
      "--title",
      "Featra 0.1.0",
      "--notes-file",
      "release/notes.md",
      "--prerelease",
      "installers/Featra-0.1.0-x64-setup.exe",
      "release/SHA256SUMS.txt",
    ]);
  });

  it("makes a 1.0 or later release the latest one, not a pre-release", () => {
    const args = publishArgs({ ...input, tag: "v1.0.0", version: "1.0.0" });
    expect(args).toContain("--latest");
    expect(args).not.toContain("--prerelease");
    expect(publishArgs({ ...input, tag: "v1.0.0-rc.1", version: "1.0.0-rc.1" })).toContain("--prerelease");
  });

  it("refuses a tag that isn't the app's version, so nothing is published for it", () => {
    expect(() => publishArgs({ ...input, tag: "v0.2.0", version: "0.1.0" })).toThrow(
      /The tag v0\.2\.0 is version 0\.2\.0, but the app's version is 0\.1\.0/,
    );
  });
});

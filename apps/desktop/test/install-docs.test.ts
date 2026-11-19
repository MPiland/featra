/**
 * STORY-65: the install guide a release links, and the README's Install section. The installer names they give are
 * checked against the names `pnpm package` builds (packaging/config.ts), so the docs can't drift from the files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installerFiles, type InstallerPlatform } from "../packaging/config.ts";
import { REPO } from "../../../tooling/test/run.ts";

const read = (...path: string[]) => readFileSync(join(REPO, ...path), "utf8").replaceAll("\r\n", "\n");
/** A Markdown section: from its `## ` heading to the next one. */
const section = (doc: string, heading: string) => doc.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";
const PLATFORMS: { os: InstallerPlatform; heading: string }[] = [
  { os: "win32", heading: "Windows" },
  { os: "darwin", heading: "macOS" },
  { os: "linux", heading: "Linux" },
];
/** The installers a platform's section names, as `<version>` stands for every version. */
const named = (os: InstallerPlatform) => installerFiles(os, "<version>");

describe("the install guide, docs/install.md (STORY-65)", () => {
  const guide = read("docs", "install.md");

  it("walks through the first launch on each platform, past the unsigned-app warning", () => {
    expect(section(guide, "Windows")).toMatch(/SmartScreen[^\n]*\n?[^\n]*\*\*More info\*\*, then \*\*Run anyway\*\*/);
    expect(section(guide, "macOS")).toContain("**System Settings > Privacy & Security**");
    expect(section(guide, "macOS")).toContain("**Open Anyway**");
    expect(section(guide, "Linux")).toContain("chmod +x Featra-<version>-x64.AppImage");
  });

  it("names each platform's installers as pnpm package builds them", () => {
    for (const { os, heading } of PLATFORMS) {
      // The macOS zip holds the same app; the section names the DMG it walks through.
      const [first] = named(os);
      expect(section(guide, heading), heading).toContain(`\`${first}\``);
    }
  });

  it("lists the tools Featra needs: git, gh and claude", () => {
    const needs = section(guide, "What Featra needs");
    for (const tool of ["git", "gh", "claude"]) expect(needs, tool).toMatch(new RegExp(`^- \`${tool}\`, `, "m"));
  });

  it("says where the version shows, and how to check a download's checksum", () => {
    expect(section(guide, "Which version you have")).toContain("The version shows under Settings");
    expect(section(guide, "Check the download")).toContain("`SHA256SUMS.txt`");
  });
});

describe("the README's Install section (STORY-65)", () => {
  const install = section(read("README.md"), "Install");

  it("links the Releases page and the install guide, and names each platform's installer", () => {
    expect(install).toContain("(https://github.com/MPiland/featra/releases)");
    expect(install).toContain("[docs/install.md](docs/install.md)");
    for (const { os } of PLATFORMS) expect(install, os).toContain(`\`${named(os)[0]}\``);
  });
});

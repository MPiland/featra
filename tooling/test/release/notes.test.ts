import { describe, expect, it } from "vitest";
import { checksumsText, FIELD, mergedPullRequests, previousTag, RECORD, releaseNotes } from "../../release/notes.ts";

const merge = (subject: string, body: string) => `${subject}${FIELD}${body}${RECORD}\n`;
const SUMS = [
  { file: "Featra-0.2.0-x64.AppImage", sha256: "b".repeat(64) },
  { file: "Featra-0.2.0-universal.dmg", sha256: "a".repeat(64) },
];

describe("the pull requests a release lists (STORY-65)", () => {
  it("reads each GitHub merge's number and title, once, in git's order", () => {
    const log = [
      merge("Merge pull request #80 from MPiland/feature/19-installers", "FEAT-19: Installers\n"),
      merge(
        "Merge pull request #75 from MPiland/claude/story-65-releases",
        "STORY-65: Download Featra from a release\n",
      ),
      merge("Merge main into feature/19-installers (BUG-31)", "Co-Authored-By: someone\n"),
      merge("Merge remote-tracking branch 'origin/main' into claude/x", ""),
      merge(
        "Merge pull request #75 from MPiland/claude/story-65-releases",
        "STORY-65: Download Featra from a release\n",
      ),
      merge("Merge pull request #9 from someone/fix-typo", "\n\n  Fix a typo  \nMore words\n"),
    ].join("");
    expect(mergedPullRequests(log)).toEqual([
      { number: 80, title: "FEAT-19: Installers" },
      { number: 75, title: "STORY-65: Download Featra from a release" },
      { number: 9, title: "Fix a typo" },
    ]);
  });

  it("names a pull request by its branch when its merge has no title", () => {
    expect(mergedPullRequests(merge("Merge pull request #3 from o/topic", ""))).toEqual([
      { number: 3, title: "o/topic" },
    ]);
  });

  it("finds no pull requests in an empty log", () => {
    expect(mergedPullRequests("")).toEqual([]);
  });

  it("also lists a card merged locally by its id and title, once, among GitHub's merges (the user's call)", () => {
    const log = [
      merge("Merge pull request #49 from MPiland/claude/bug-21", "BUG-21: PR refresh test waits for both pollers\n"),
      merge("Merge FEAT-6: PRs, CI, merges and bugs", ""),
      merge("Merge STORY-12: Merge a story into its feature", "Co-Authored-By: someone\n"),
      merge("Merge BUG-3: Tray e2e foreground helper", ""),
      merge("Merge EPIC-1: Prove the core", ""),
      merge("Merge STORY-12: Merge a story into its feature", ""),
    ].join("");
    expect(mergedPullRequests(log)).toEqual([
      { number: 49, title: "BUG-21: PR refresh test waits for both pollers" },
      { number: null, title: "FEAT-6: PRs, CI, merges and bugs" },
      { number: null, title: "STORY-12: Merge a story into its feature" },
      { number: null, title: "BUG-3: Tray e2e foreground helper" },
      { number: null, title: "EPIC-1: Prove the core" },
    ]);
  });

  it("skips syncs and merges that name no card", () => {
    const log = [
      merge("Merge main into feature/19-installers (BUG-31)", ""),
      merge("Merge main into STORY-25; roadmap and installers decision", ""),
      merge("Merge remote-tracking branch 'origin/main' into claude/feat-8-shaping", ""),
      merge("Merge origin/main into FEAT-7 shaping", ""),
      merge("Merge feature/8-auto-merge (STORY-60) into STORY-61", ""),
      merge("Merge origin/feature/7-progress into STORY-16", ""),
      merge("Merge branch 'topic'", ""),
      merge("Merge STORY-12 into main", ""),
      merge("Merge TASK-1: Not a card type", ""),
    ].join("");
    expect(mergedPullRequests(log)).toEqual([]);
  });
});

describe("the last release before a tag (STORY-65)", () => {
  it("for a pre-release, is the highest release tag below it, pre-releases included", () => {
    const tags = ["v0.1.0", "v0.2.0-rc.1", "v0.10.0", "v0.2.0", "v0.3.0", "not-a-release", "v0.2.1-rc.1"];
    expect(previousTag(tags, "v0.2.1-rc.2")).toBe("v0.2.1-rc.1");
    expect(previousTag(tags, "v0.2.0-rc.2")).toBe("v0.2.0-rc.1");
    expect(previousTag(tags, "v0.3.0-rc.1")).toBe("v0.2.1-rc.1");
    expect(previousTag(["v1.0.0-rc.1"], "v1.0.0-rc.2")).toBe("v1.0.0-rc.1");
  });

  it("for a full release, is the highest full release below it, skipping release candidates (the user's call)", () => {
    expect(previousTag(["v0.9.0", "v1.0.0-rc.1"], "v1.0.0")).toBe("v0.9.0");
    const tags = ["v0.1.0", "v0.2.0-rc.1", "v0.10.0", "v0.2.0", "v0.3.0", "not-a-release", "v0.2.1-rc.1"];
    expect(previousTag(tags, "v0.2.1")).toBe("v0.2.0");
    expect(previousTag(tags, "v0.2.0")).toBe("v0.1.0");
    expect(previousTag(tags, "v0.11.0")).toBe("v0.10.0");
    expect(previousTag(tags, "v0.3.0")).toBe("v0.2.0");
    expect(previousTag(["v1.0.0-rc.1"], "v1.0.0")).toBeNull();
  });

  it("is none for the first release", () => {
    expect(previousTag([], "v0.1.0")).toBeNull();
    expect(previousTag(["v0.1.0", "v0.2.0"], "v0.1.0")).toBeNull();
  });
});

describe("a release's notes and checksums (STORY-65)", () => {
  it("writes one sha256sum line per installer, by file name", () => {
    expect(checksumsText(SUMS)).toBe(
      `${"a".repeat(64)}  Featra-0.2.0-universal.dmg\n${"b".repeat(64)}  Featra-0.2.0-x64.AppImage\n`,
    );
  });

  it("list the changes since the last release, the unsigned-build note with the install guide, and each checksum", () => {
    const notes = releaseNotes({
      version: "0.2.0",
      previous: "v0.1.0",
      prs: [
        { number: 80, title: "FEAT-19: Installers" },
        { number: 75, title: "STORY-65: Download Featra from a release" },
      ],
      checksums: SUMS,
      installGuide: "https://github.com/o/r/blob/v0.2.0/docs/install.md",
    });
    expect(notes).toBe(
      [
        "Featra 0.2.0 for Windows, macOS and Linux.",
        "",
        "## Unsigned build",
        "",
        "These installers aren't signed yet, so Windows and macOS warn the first time Featra opens. The " +
          "[install guide](https://github.com/o/r/blob/v0.2.0/docs/install.md) shows how to open it anyway, and what " +
          "Featra needs: `git`, `gh` and `claude`.",
        "",
        "## Changes since v0.1.0",
        "",
        "- FEAT-19: Installers (#80)",
        "- STORY-65: Download Featra from a release (#75)",
        "",
        "## SHA-256 checksums",
        "",
        "Also in `SHA256SUMS.txt`, for `sha256sum -c`.",
        "",
        "```",
        `${"a".repeat(64)}  Featra-0.2.0-universal.dmg`,
        `${"b".repeat(64)}  Featra-0.2.0-x64.AppImage`,
        "```",
        "",
      ].join("\n"),
    );
  });

  it("say so when it is the first release, or nothing was merged", () => {
    const notes = releaseNotes({ version: "0.1.0", previous: null, prs: [], checksums: SUMS, installGuide: "u" });
    expect(notes).toContain("\n## Changes\n\n- No pull requests were merged.\n");
  });

  it("list a card merged locally by its id and title, with no pull request number", () => {
    const prs = [
      { number: 49, title: "BUG-21: PR refresh test waits for both pollers" },
      { number: null, title: "FEAT-6: PRs, CI, merges and bugs" },
    ];
    const notes = releaseNotes({ version: "0.1.0", previous: null, prs, checksums: SUMS, installGuide: "u" });
    expect(notes).toContain(
      "\n## Changes\n\n- BUG-21: PR refresh test waits for both pollers (#49)\n- FEAT-6: PRs, CI, merges and bugs\n\n",
    );
  });
});

/**
 * STORY-11: the safety boundary around the user's `gh`. On Windows a `.cmd` shim runs through cmd.exe, so every
 * argument that isn't plain is quoted, and a part with a character cmd.exe reads even inside quotes is never run. The
 * real runner runs a fake `gh` that records the arguments it got; the real `gh` and its login are never used.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PR_FIELDS } from "@featra/work-format";
import { runGh, windowsCommand } from "../src/gh-run.ts";
import { fakeGh, type FakeGh } from "./fake-gh.ts";

describe("the Windows command line", () => {
  it("quotes the program's path, and each argument that isn't plain", () => {
    expect(windowsCommand("C:/Program Files/gh/gh.cmd", ["pr", "view", "https://github.com/a/b/pull/1"])).toBe(
      '"C:/Program Files/gh/gh.cmd" pr view https://github.com/a/b/pull/1',
    );
    expect(windowsCommand("gh", ["api", "repos/{owner}/{repo}/pulls", "--input", "-"])).toBe(
      "gh api repos/{owner}/{repo}/pulls --input -",
    );
    expect(windowsCommand("gh", ["auth", "a b", "x&y", "x|y", "x<y", "(x)"])).toBe(
      'gh auth "a b" "x&y" "x|y" "x<y" "(x)"',
    );
  });

  it("quotes commas and equals signs, which cmd.exe splits arguments on", () => {
    expect(windowsCommand("gh", ["pr", "view", "--json", "number,url"])).toBe('gh pr view --json "number,url"');
    expect(windowsCommand("gh", ["x", "--jq=.a"])).toBe('gh x "--jq=.a"');
    expect(windowsCommand("gh", ["--json", PR_FIELDS])).toBe(`gh --json "${PR_FIELDS}"`);
  });

  it("refuses a part with a character cmd.exe reads even inside quotes", () => {
    for (const bad of ['a"b', "50%", "a^b", "wow!", "a\rb", "a\nb"]) {
      expect(windowsCommand("gh", ["pr", bad])).toBeNull();
      expect(windowsCommand(`C:/${bad}/gh.cmd`, ["pr"])).toBeNull();
    }
  });
});

describe("running gh", { timeout: 30_000 }, () => {
  let gh: FakeGh;
  beforeEach(async () => {
    gh = await fakeGh();
  });
  afterEach(() => gh.dispose());

  it("hands gh each argument whole, commas, braces and spaces included", async () => {
    const args = ["--version", "--json", PR_FIELDS, "repos/{owner}/{repo}/pulls", "a b", "x&y"];
    const r = await runGh(process.cwd(), args, { gh: gh.command });
    expect(r?.code).toBe(0);
    expect((await gh.calls()).at(-1)?.args).toEqual(args);
  });

  it.runIf(process.platform === "win32")(
    "on Windows runs nothing with a character cmd.exe reads in quotes",
    async () => {
      expect(await runGh(process.cwd(), ["--version", '"&calc'], { gh: gh.command })).toBeNull();
      expect(await runGh(process.cwd(), ["--version", "%PATH%"], { gh: gh.command })).toBeNull();
      expect(await gh.calls()).toEqual([]);
    },
  );

  it("doesn't succeed when gh isn't there", async () => {
    // Null where it can't start; through cmd.exe, cmd's own failure exit code.
    const r = await runGh(process.cwd(), ["--version"], { gh: "gh-that-is-not-installed" });
    expect(r === null || r.code !== 0).toBe(true);
  });
});

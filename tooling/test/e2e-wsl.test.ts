import { describe, expect, it } from "vitest";
import { copyName, wslArgs } from "../e2e/wsl.ts";

describe("pnpm test:e2e:wsl", () => {
  it("runs wsl-run.sh in the chosen distro from the checkout, passing Playwright's arguments on", () => {
    const root = String.raw`D:\src\featra`;
    expect(wslArgs("Ubuntu", root, "featra", ["tray.spec.ts", "--repeat-each", "3"])).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      root,
      "--",
      "bash",
      "tooling/e2e/wsl-run.sh",
      "featra",
      "tray.spec.ts",
      "--repeat-each",
      "3",
    ]);
  });

  it("names the copy in WSL after the checkout's folder, so worktrees get their own", () => {
    expect(copyName(String.raw`D:\src\featra\.claude\worktrees\story-43-ci`)).toBe("story-43-ci");
    expect(copyName("/home/me/my checkout")).toBe("my-checkout");
  });
});

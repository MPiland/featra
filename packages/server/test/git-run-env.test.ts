import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitEnv, runGit } from "../src/git-run.ts";
import { cleanGitEnv, tempFolder } from "./temp-folder.ts";

/** Product git calls keep the user's environment config (GIT_CONFIG_COUNT and friends); only the repo overrides go. */
describe("the git environment the server passes on", () => {
  const keys = ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0", "GIT_DIR"] as const;
  let saved: Partial<Record<(typeof keys)[number], string | undefined>>;
  beforeEach(() => {
    saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("passes GIT_CONFIG_COUNT through, so git reads the user's settings from the environment", async () => {
    const folder = await tempFolder({ git: true });
    try {
      process.env.GIT_CONFIG_COUNT = "1";
      process.env.GIT_CONFIG_KEY_0 = "user.name";
      process.env.GIT_CONFIG_VALUE_0 = "Env Person";
      expect(gitEnv().GIT_CONFIG_COUNT).toBe("1");
      const r = await runGit("git", folder.dir, ["config", "user.name"]);
      expect(r.stdout.trim()).toBe("Env Person");
      // The test's own helper, by contrast, strips every GIT_ variable.
      expect(
        execFileSync("git", ["config", "user.name"], { cwd: folder.dir, env: cleanGitEnv() }).toString().trim(),
      ).not.toBe("Env Person");
    } finally {
      await folder.dispose();
    }
  });

  it("still drops the variables that point git at another repository", () => {
    process.env.GIT_DIR = "/elsewhere";
    expect(gitEnv().GIT_DIR).toBeUndefined();
  });
});

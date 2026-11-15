import { mkdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { checkRun, fakeGh } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, openedExternal, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-11: a story's PR. The real app, its real local server and real git; only the platform, the agent (agent.ts)
 * and GitHub are faked: `gh` is a stand-in on the PATH (packages/server/test/fake-gh.cjs) and the remote is a bare
 * repository on disk whose path names github.com. The story moves to In Review, its branch is pushed and its PR
 * opened; the card and the Work row show the PR chip, which opens the PR; CI checks read on focus make the story
 * Verified, and a failing check takes it away.
 */
test("A story moving to review opens its PR, the chip shows it, and CI checks verify the story", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
  const gh = await fakeGh();
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      // The stand-in gh comes first, so the real one and its login are never used.
      [PATH_KEY]: [gh.bin, bin.path].join(delimiter),
    });
    running = app;
    const nav = page.getByRole("navigation", { name: "Featra" });

    // AC1: GitHub is usable, so Project settings show no local-mode line.
    await nav.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("navigation", { name: "Settings pages" })
      .getByRole("list", { name: "Project" })
      .getByRole("button", { name: "Workflow" })
      .click();
    const prs = page.getByRole("region", { name: "Pull requests" });
    await expect(prs.getByRole("switch", { name: "Open story PRs automatically" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(prs.getByText(/^Local mode/)).toHaveCount(0);

    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    await expect
      .poll(() => git(repo.dir, "branch", "--format=%(refname:short)"))
      .toMatch(/featra\/story-\d+-draft-a-feature/);
    const branch =
      git(repo.dir, "branch", "--format=%(refname:short)")
        .split("\n")
        .find((b) => b.startsWith("featra/story-")) ?? "";
    const id = `STORY-${/story-(\d+)-/.exec(branch)?.[1]}`;

    // AC2: moving the story to In Review pushes its branch and opens its PR against the feature branch.
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    const url = "https://github.com/acme/app/pull/1";
    const section = card.getByRole("region", { name: "PR" });
    // AC3: the chip is the PR number, the full URL on hover, with the PR's state.
    const chip = section.getByRole("link", { name: "#1", exact: true });
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await expect(chip).toHaveAttribute("title", url);
    await expect(section).not.toContainText(url);
    await expect(section).toContainText("Open");
    expect(git(remote, "branch", "--format=%(refname:short)").split("\n")).toEqual(
      expect.arrayContaining(["feature/2-shaping", branch]),
    );
    expect((await gh.load()).prs[0]).toMatchObject({ head: branch, base: "feature/2-shaping" });
    await chip.click();
    await expect.poll(() => openedExternal(app)).toEqual([url]);
    await expect(row.getByRole("link", { name: "#1", exact: true })).toHaveAttribute("title", url);

    // AC4, AC5: CI's checks pass; the window regains focus, the PR is read again, and the story is Verified.
    const evidence = card.getByRole("list", { name: "Evidence" });
    await expect(evidence).not.toContainText("Verified: yes");
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(section).toContainText("Checks passing", { timeout: 30_000 });
    await expect(evidence).toContainText("Verified: yes");
    await expect(row.getByRole("img", { name: "Checks passing" })).toBeVisible();

    // A failing check takes Verified away.
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("FAILURE")];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(section).toContainText("Checks failing", { timeout: 30_000 });
    await expect(evidence).not.toContainText("Verified: yes");
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await github.dispose();
    await gh.dispose();
    await bin.dispose();
  }
});

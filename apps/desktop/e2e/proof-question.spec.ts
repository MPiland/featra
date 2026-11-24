import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { project } from "./draft-project.ts";
import { proofSettings } from "./proof-setup.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-25 AC1: when the project's first feature is shaped, the Dev Lead's chat asks once how stories show they work,
 * on the question card; the answer is the project's proof, which Settings > Project shows. The real app, its real
 * local server and real git; only the platform and the agent are faked (agent.ts). The question is the app's, not the
 * agent's: the fake agent only drafts.
 */
test("The proof question: asked once at the first feature, and the answer shows in Project settings", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\n", { firstFeature: false });
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    running = app;
    await atReviewSize(app, page);
    await draftInNewChat(page, "FEAT-1");

    const log = page.getByRole("log", { name: "Chat" });
    const card = log.getByRole("form", { name: "Question" });
    await expect(card).toHaveCount(1);
    const options = card.getByRole("group", { name: /How should stories show they work/ }).getByRole("radio");
    await expect(options).toHaveCount(4);
    await uxShot(page, "feat9-proof-question", card);
    await card.getByRole("radio", { name: /^Both/ }).check();
    await card.getByRole("button", { name: "Submit" }).click();
    await expect(card).toHaveCount(0);
    await expect(log.getByText("Answered")).toBeVisible();
    const config = join(repo.dir, ".featra", "config.yaml");
    await expect.poll(() => readFile(config, "utf8")).toMatch(/^proof: both$/m);

    // The answer is a project setting, shown and changed in Settings > Project.
    const section = await proofSettings(page);
    await expect(section.getByRole("radio", { name: "Both" })).toBeChecked();
    await uxShot(page, "feat9-proof-settings", section);
    await section.getByRole("radio", { name: "Screenshots" }).check();
    await expect.poll(() => readFile(config, "utf8")).toMatch(/^proof: screenshots$/m);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});

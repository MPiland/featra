/**
 * STORY-74: the feature preview checkouts a quit left behind are removed when their project opens, and nothing else
 * is. The real Browser pane services (browser-preview.ts), real git and a real repository; nothing runs a dev server.
 */
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserPreview, PREVIEW_PREFIX } from "../src/browser-preview.ts";
import { createDevServers } from "../src/dev-servers.ts";
import { createMergeGit } from "../src/merge-git.ts";
import { createProofSettings } from "../src/proof-settings.ts";
import { checkoutAt, removeCheckout } from "../src/temp-checkout.ts";
import { cardRepo, type CardRepo } from "./card-repo.ts";

/** No project reads as a work folder: nothing here starts a dev server. */
const scan = async () => null;
let repo: CardRepo | null = null;
afterEach(async () => {
  await repo?.dispose();
  repo = null;
});

describe("Preview checkouts a quit left behind", () => {
  it("are removed when their project opens, and other temporary checkouts are kept", async () => {
    repo = await cardRepo();
    repo.commit(repo.main, "first");
    const git = createMergeGit();
    const tip = repo.git(repo.main, "rev-parse", "HEAD").trim();
    const left = await checkoutAt(git, repo.main, tip, PREVIEW_PREFIX);
    const other = await checkoutAt(git, repo.main, tip, "featra-feature-checks-");
    if (!left.ok || !other.ok) throw new Error("The checkouts weren't made.");
    const browser = createBrowserPreview({
      scan,
      git,
      servers: createDevServers(),
      settings: createProofSettings({ scan }),
    });

    browser.sweep([repo.main]);
    await browser.close();

    expect(existsSync(left.checkout.folder)).toBe(false);
    const listed = repo.git(repo.main, "worktree", "list");
    expect(listed).not.toContain(left.checkout.folder.split(/[\\/]/).at(-1));
    expect(existsSync(other.checkout.folder)).toBe(true);
    await removeCheckout(git, other.checkout);
  });
});

/**
 * STORY-71 through the server's API, as the window calls it: `feature.askChanges` and `feature.dismissChanges` beside
 * `review.watch`, with the Dev Lead's chat started by `chat.start`. Real services, chat manager, scanner, watches,
 * cards and git; only the Agent SDK and the clock are faked. What the screen shows is read from the feature's history,
 * so a restarted server shows it the same.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHANGES_REFUSALS, DRAFTED_BY, type FeatureApproval, type FeatureReview } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import type { Connection } from "../src/api.ts";
import { createFeatureChanges } from "../src/feature-changes.ts";
import { createFeatureStart } from "../src/feature-start.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createServices } from "../src/services.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, withIdentity, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";
import { until } from "./until.ts";

const NOW = new Date("2026-11-10T09:30:00Z");
const AT = "2026-11-10T09:30:00Z";
let repo: CardRepo;
let services: ReturnType<typeof createServices>;
let scanner: ReturnType<typeof createScanner>;
let lead = "";
const pushed: { event: string; data: unknown }[] = [];
const connection: Connection = {
  push: (event, _watch, data) => void pushed.push({ event, data }),
  keep: () => {},
  unwatch: () => false,
};
const ask = (method: string, params: unknown) =>
  services.api(method as Parameters<typeof services.api>[0], params, 1, connection);
const review = () => pushed.findLast((p) => p.event === "review.view")?.data as FeatureReview | null | undefined;
const feature = { dir: "", id: "FEAT-1" };

function startServices() {
  const allowed = createAllowedProjects();
  allowed.set([repo.main]);
  return createServices({ allowed, log: () => {}, now: () => NOW, claude: fakeClaude().deps });
}

beforeEach(async () => {
  repo = await cardRepo();
  withIdentity(repo);
  feature.dir = repo.main;
  scanner = createScanner(createRepoGit());
  services = startServices();
  lead = ((await ask("chat.start", { dir: repo.main, role: "dev-lead" })) as { id: string }).id;
  await repo.write(repo.main, card("FEAT-1", "feature", null, "approved", { extra: { [DRAFTED_BY]: lead } }));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  await createFeatureStart({ scan: scanner.scan, now: () => NOW }).start(repo.main, "FEAT-1", "user");
  pushed.length = 0;
});
afterEach(async () => {
  await services.close();
  await scanner.close();
  await repo.dispose();
});

describe("changes asked on the review screen (STORY-71)", () => {
  it("shows Changes asked with the reason, leaves Approve as it was, and clears on Dismiss (AC2, AC4, AC5)", async () => {
    const first = (await ask("review.watch", feature)) as FeatureReview;
    expect(first.changes).toBeNull();
    const approval: FeatureApproval | null = first.approval;
    expect(approval?.step).toBe("approve");

    expect(await ask("feature.askChanges", { ...feature, reason: "Rename Save to Keep." })).toEqual({ recorded: true });
    await until(() => review()?.changes != null);
    expect(review()?.changes).toEqual({ asked: [{ text: "Rename Save to Keep.", at: AT }], reply: null });
    expect(review()?.approval).toEqual(approval);

    expect(await ask("feature.dismissChanges", feature)).toBeNull();
    await until(() => review()?.changes === null);
    expect(review()?.approval).toEqual(approval);
  });

  it("shows the Dev Lead's reply once it marks the changes handled (AC3)", async () => {
    await ask("review.watch", feature);
    await ask("feature.askChanges", { ...feature, reason: "Rename Save to Keep." });
    const changes = createFeatureChanges({
      scan: scanner.scan,
      now: () => NOW,
      chats: { list: () => [], dirOf: () => null, open: async () => {}, send: () => {} },
    });
    await changes.handled(repo.main, { feature: "FEAT-1", reply: "Renamed it." }, lead);
    await until(() => review()?.changes?.reply != null);
    expect(review()?.changes?.reply).toEqual({ text: "Renamed it.", at: AT });
  });

  it("keeps the changes asked across a restart, since they are read from the feature's history", async () => {
    await ask("feature.askChanges", { ...feature, reason: "Rename Save to Keep." });
    await services.close();
    services = startServices();
    const again = (await ask("review.watch", feature)) as FeatureReview;
    expect(again.changes).toEqual({ asked: [{ text: "Rename Save to Keep.", at: AT }], reply: null });
  });

  it("refuses an empty reason and a request without one", async () => {
    await expect(ask("feature.askChanges", { ...feature, reason: " " })).rejects.toThrow(CHANGES_REFUSALS.noReason);
    await expect(ask("feature.askChanges", feature)).rejects.toThrow("Expected { dir, id, reason }.");
    await expect(ask("feature.dismissChanges", feature)).rejects.toThrow(CHANGES_REFUSALS.nothingAsked);
  });
});

/**
 * The shared world of the STORY-73 server tests: the real services (story-fixture.ts) with a project whose proof
 * captures screenshots and an idle Dev Lead chat. Only the platform is faked: the Agent SDK, the clock, and the dev
 * server and page capture behind the proof (proof-world.ts).
 */
import { join } from "node:path";
import type { CardView } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { CONFIG, proofPlatform, TWO } from "./proof-world.ts";
import { storyWorld, type Client } from "./story-fixture.ts";
import { finish, idleLead, noticesIn } from "./story-lead.ts";

export const PAGE = [{ criterion: "Settings show it", page: "/settings" }];
export const FINDINGS = "The Save button overlaps the footer.";
export const changesOf = (frame: { result?: unknown }) => (frame.result as { changes: string[] }).changes;

/** `agent` calls update_card with `params`; the answer. */
async function update(agent: Client, params: Record<string, unknown>) {
  const id = Math.floor(Math.random() * 1e9);
  agent.socket.send({ id, method: "card.update", params });
  return agent.socket.next((f) => f.id === id);
}

/** The world; `drafted`: FEAT-2 was drafted by a Dev Lead chat of its own (`w.drafter`), not the one that spawns. */
export async function designWorld(drafted = false) {
  const w = await storyWorld({
    drafted,
    config: CONFIG.replace("maxStoryAgents: 9", "maxStoryAgents: 20"),
    proof: proofPlatform,
  });
  // The user confirms the dev-server command in Settings, and the project's proof captures screenshots.
  await w.window.ask("proof.set", { dir: w.dir, patch: { confirm: true } });
  const lead = await idleLead(w);

  /** Card `id` as the card pane shows it. */
  const view = async (id: string) => (await w.window.ask("card.watch", { dir: w.dir, id })).result as CardView;

  /** Story `id` spawned by the Dev Lead, with two criteria; its session's socket, run and worktree. */
  async function spawned(id: string, name: string) {
    const child = await w.spawnAs(lead, id);
    child.run.say(sdk.init());
    const tree = join(w.repo.main, ".claude", "worktrees", name);
    await w.repo.write(tree, { ...(await w.card(id, tree)), acs: TWO });
    return { ...child, tree, session: await w.agentOf(child.chat) };
  }

  /** The Dev Lead takes in what it was told, and its turn ends. */
  async function leadHeard(n: number) {
    await w.until(() => noticesIn(lead.events()).length === n);
    finish(lead.run, "Noted.");
    await w.until(() => lead.events().filter((e) => e.type === "turn-end").length === n + 1);
  }

  return { w, lead, update, view, spawned, leadHeard };
}

export type DesignWorld = Awaited<ReturnType<typeof designWorld>>;

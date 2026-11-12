/**
 * STORY-56: the checks through the server's two sockets. The Dev Lead proposes a check command with `checks.propose`
 * and only the user's `checks.set` applies it; a story reaching review runs the check command, and the window's
 * `card.watch` hears the failing output and asks for Re-run. Real services, sockets, git and cards; only the Agent SDK
 * and the clock are faked.
 */
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evidenceState, parseCard, type CardChecks, type CardView, type ChecksView } from "@featra/work-format";
import { AGENT_MESSAGES } from "../src/agent-bridge.ts";
import { card, moved } from "./card-repo.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";
import { idleLead } from "./story-lead.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({
    config: `maxStoryAgents: 10\nchecksWhere: local\ncheckCommand: 'node -e "console.log(1234567);process.exit(1)"'\n`,
  });
});
afterAll(() => w.close());

const confirmCommand = () => w.window.ask("checks.set", { dir: w.dir, patch: { confirm: ["command"] } });

const load = async () => (await w.window.ask("checks.load", { dir: w.dir })).result as ChecksView;

describe("the Dev Lead proposes a check command (AC2)", { timeout: 30_000 }, () => {
  it("puts it in Project settings and applies nothing until the user confirms it", async () => {
    const lead = await w.devLead();
    const answered = await lead.agent.ask("checks.propose", {
      command: "pnpm run check",
      testCommand: "npx vitest run {file}",
    });
    expect(answered).toMatchObject({ ok: true, result: { proposed: ["command", "testCommand"] } });
    const shown = await load();
    expect(shown.proposals).toEqual(
      expect.arrayContaining([
        { field: "command", value: "pnpm run check", source: "dev-lead" },
        { field: "testCommand", value: "npx vitest run {file}", source: "dev-lead" },
      ]),
    );
    expect(shown.command).toContain("console.log(1234567)");
    const config = await readFile(`${w.dir}/.featra/config.yaml`, "utf8");
    expect(config).not.toContain("pnpm run check");
  });

  it("is applied by the user's confirm, which edits the project's config", async () => {
    const lead = await w.devLead();
    await lead.agent.ask("checks.propose", { testCommand: "npx vitest run {file} -t {name}" });
    const before = await load();
    expect(before.testCommand).toBeNull();
    const set = await w.window.ask("checks.set", {
      dir: w.dir,
      patch: { testCommand: "npx vitest run {file} -t {name}" },
    });
    expect((set.result as ChecksView).testCommand).toBe("npx vitest run {file} -t {name}");
    expect(await readFile(`${w.dir}/.featra/config.yaml`, "utf8")).toContain("linkedTestCommand: npx vitest run");
  });

  it("is refused for input that isn't one line of text, or empty, and to a story session", async () => {
    const lead = await idleLead(w);
    expect(await lead.agent.ask("checks.propose", { command: "a\nb" })).toMatchObject({ ok: false });
    expect(await lead.agent.ask("checks.propose", {})).toMatchObject({ ok: false });
    const child = await w.spawnAs(lead, "STORY-7");
    const own = await w.agentOf(child.chat);
    expect(await own.ask("checks.propose", { command: "rm -rf /" })).toMatchObject({
      ok: false,
      error: AGENT_MESSAGES.sessionPropose,
    });
  });

  it("is refused to the window for a bad patch and a folder that isn't open", async () => {
    expect(await w.window.ask("checks.set", { dir: w.dir, patch: { where: "mars" } })).toMatchObject({ ok: false });
    expect(await w.window.ask("checks.load", { dir: `${w.dir}-other` })).toMatchObject({ ok: false });
  });
});

describe("a story reaching review (AC3, AC4)", { timeout: 60_000 }, () => {
  it("shows the config's check command as changed until the user confirms it, through checks.set", async () => {
    expect((await load()).unconfirmed).toEqual(["command"]);
    const set = await confirmCommand();
    expect((set.result as ChecksView).unconfirmed).toEqual([]);
    expect((await load()).unconfirmed).toEqual([]);
  });

  it("runs the check command, then the card pane hears the failing output, and Re-run runs it again", async () => {
    const lead = await idleLead(w);
    await w.spawnAs(lead, "STORY-5");
    const listing = w.repo.git(w.repo.main, "worktree", "list", "--porcelain");
    const tree = listing
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => l.slice("worktree ".length))
      .find((p) => /story-5/i.test(p));
    expect(tree).toBeDefined();
    const inProgress = parseCard(await w.repo.read(tree!, "STORY-5"));
    expect(inProgress.status).toBe("In Progress");

    const watch = await w.window.ask("card.watch", { dir: w.dir, id: "STORY-5" });
    expect((watch.result as CardView).checks).toBeUndefined();
    await w.repo.write(
      tree!,
      moved({ ...card("STORY-5", "story", "FEAT-2", "In Progress"), history: inProgress.history }, "In Review"),
    );
    await w.window.ask("checks.load", { dir: w.dir });

    const heard = () =>
      w.window.socket.frames
        .filter((f) => f.event === "card.view" && f.watch === watchId(watch))
        .map((f) => f.data as CardView)
        .at(-1)?.checks;
    await w.until(() => heard()?.last !== null && heard()?.last !== undefined, 30_000);
    const checks = heard() as CardChecks;
    expect(checks.last?.passed).toBe(false);
    expect(checks.last?.output).toContain("1234567");

    const after = parseCard(await w.repo.read(tree!, "STORY-5"));
    expect(evidenceState(after).verified).toBe(false);

    const again = await w.window.ask("story.rerunChecks", { dir: w.dir, id: "STORY-5" });
    expect(again.ok).toBe(true);
    expect((await w.window.ask("story.rerunChecks", { dir: w.dir, id: "STORY-9" })).ok).toBe(false);
  });
});

/** The id the window gave the `card.watch` request: its answer carries it. */
const watchId = (frame: { id?: unknown }) => frame.id as number;

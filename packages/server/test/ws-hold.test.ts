import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isHeld, parseCard } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { openFrames, type SocketFrame } from "./ws-frames.ts";

/**
 * STORY-61 over the real socket and the real services, on a real repository: Hold is offered while the auto-merge
 * setting in effect is on, the app default included, and `story.hold` writes the user's turn of it to the card.
 */
const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
let services: ReturnType<typeof createServices>;
let server: RunningServer;
let repo: CardRepo;
let settings: string;
let tree: string;

interface WorkData {
  epics: { features: { stories: { id: string; held?: boolean }[] }[] }[];
}
type Frame = SocketFrame<WorkData>;
const open = () => openFrames<WorkData>(`${server.url}?token=${TOKEN}`);
const heldOf = (f: Frame) =>
  f.data?.epics.flatMap((e) => e.features.flatMap((x) => x.stories)).find((s) => s.id === "STORY-1")?.held;

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  // STORY-1 started: its worktree's copy, moved on, owns it.
  tree = repo.worktree("claude/story-1", "story-1");
  await repo.write(tree, card("STORY-1", "story", "FEAT-1", "In Progress", { branch: "claude/story-1" }));
  const data = await mkdtemp(join(repo.root, "data-"));
  settings = join(data, "settings.json");
  await writeFile(settings, JSON.stringify({ work: { autoMerge: false } }));
  services = createServices({ allowed, log: () => {}, now: () => new Date("2026-11-16T12:00:00Z"), dataDir: data });
  allowed.set([repo.main]);
  server = await startServer({ token: TOKEN, api: services.api, log: () => {} });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await repo.dispose();
});

describe("STORY-61 AC1: Hold over the socket, while the auto-merge setting in effect is on", () => {
  it("is offered once the app default is turned on and saved, and holds the story by the user", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "work.watch", params: { dir: repo.main } });
      const answer = await socket.next((f) => f.id === 1);
      expect(heldOf(answer)).toBeUndefined();
      socket.send({ id: 2, method: "story.hold", params: { dir: repo.main, id: "STORY-1", held: true } });
      expect(await socket.next((f) => f.id === 2)).toEqual({
        id: 2,
        ok: false,
        error: "Auto-merge is off for this project.",
      });

      // The app default turned on, and the host says the app's settings were saved: the row offers Hold.
      await writeFile(settings, JSON.stringify({ work: { autoMerge: true } }));
      services.settingsChanged();
      const offered = await socket.next((f) => f.event === "work.list" && heldOf(f) === false);
      expect(heldOf(offered)).toBe(false);

      socket.send({ id: 3, method: "story.hold", params: { dir: repo.main, id: "STORY-1", held: true } });
      expect(await socket.next((f) => f.id === 3)).toEqual({ id: 3, ok: true, result: null });
      await socket.next((f) => f.event === "work.list" && heldOf(f) === true);
      const story = parseCard(await repo.read(tree, "STORY-1"));
      expect(isHeld(story)).toBe(true);
      expect(story.history.at(-1)).toMatchObject({ field: "held", to: "held", by: "user" });
    } finally {
      socket.close();
    }
  });
});

/**
 * The screenshots Featra attaches when a story moves to review (STORY-25, ADR 0044). For each criterion that lists a
 * page it starts the story's dev server in its worktree and has the desktop host capture the page; for each other
 * criterion with a screenshot the project's own tests wrote (proof-files.ts's rule), it copies that. Each lands in the
 * story's evidence folder and is linked as the criterion's evidence, as an agent's own file is (STORY-72), with no
 * agent and no tokens. What fails is a note on the criterion, kept in memory, and never stops the move to review.
 * Nothing is committed: the agent whose report moved the story commits the files with the card.
 */
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  capturesScreenshots,
  EVIDENCE_BYTES,
  EVIDENCE_KEY,
  evidenceExtension,
  evidenceFolder,
  isProofShot,
  matchTestShots,
  offersPreview,
  pageUrl,
  PROOF_COPY,
  proofShotPath,
  proofTargets,
  serializeCard,
  type CardView,
  type ProofNotes,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { CardLane } from "./card-lane.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { DevServers, DevServerStart } from "./dev-servers.ts";
import type { CapturePage } from "./host-capture.ts";
import type { ProofSettings } from "./proof-settings.ts";
import type { Scan } from "./work-scan.ts";

export interface ProofCaptureDeps {
  scan: (dir: string) => Promise<Scan | null>;
  lane: CardLane;
  servers: Pick<DevServers, "start">;
  capture: CapturePage;
  settings: Pick<ProofSettings, "command">;
  log?: (message: string) => void;
}

const samePath = (a: string, b: string) =>
  process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

/** Copies a test's screenshot unless it is too big to be evidence; false when it is, or can't be read. */
async function copyShot(from: string, to: string): Promise<boolean> {
  const size = await stat(from).then(
    (s) => (s.isFile() ? s.size : null),
    () => null,
  );
  if (size === null || size > EVIDENCE_BYTES) return false;
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  return true;
}

/** A story's notes, by project and id. */
const key = (dir: string, id: string) => `${dir}\n${id}`;

export function createProofCapture({ scan, lane, servers, capture, settings, log = () => {} }: ProofCaptureDeps) {
  const notes = new Map<string, ProofNotes>();

  /** The story's worktree and config, when it has a worktree of its own. */
  async function storyIn(dir: string, id: string) {
    const current = await scan(dir);
    const found = ownedIn(current, id);
    if (!current || !found?.root || found.owned.card.type !== "story" || samePath(found.root, dir)) return null;
    return { card: found.owned.card, path: found.owned.path, root: found.root, config: current.collected.config };
  }

  /** The story's dev server, started in its worktree when it isn't running. */
  async function serverOf(
    dir: string,
    story: NonNullable<Awaited<ReturnType<typeof storyIn>>>,
  ): Promise<DevServerStart> {
    const command = await settings.command(dir, story.config);
    if (!command.ok) return { ok: false, note: command.note };
    return servers.start(dir, story.card.id, story.root, command.command, story.config.devServerUrl ?? "");
  }

  /** Links each criterion's new screenshot, in the card lane; an agent's own evidence linked meanwhile stays. */
  async function link(dir: string, id: string, links: ReadonlyMap<number, string>) {
    const story = await storyIn(dir, id);
    const folder = story ? evidenceFolder(story.card) : null;
    if (!story || !folder) return;
    const acs = story.card.acs.map((ac, i) => {
      const path = links.get(i);
      return path && (!ac.evidence || isProofShot(folder, ac.evidence)) ? { ...ac, evidence: path } : ac;
    });
    const card = { ...story.card, acs, extra: { ...story.card.extra, [EVIDENCE_KEY]: folder } };
    await writeAtomic(fileIn(story.root, story.path), serializeCard(card));
  }

  async function attach(dir: string, id: string): Promise<string[]> {
    const story = await storyIn(dir, id);
    const folder = story ? evidenceFolder(story.card) : null;
    if (!story || !folder) return [];
    const { root, config } = story;
    const shots = config.testScreenshots ? join(root, config.testScreenshots) : null;
    const tested = shots ? matchTestShots(id, await readdir(shots).catch(() => [])) : new Map<number, string>();
    const mine: ProofNotes = {};
    const links = new Map<number, string>();
    let server: DevServerStart | null = null;
    for (const target of proofTargets(story.card.acs, folder, tested, capturesScreenshots(config.proof))) {
      if ("testShot" in target) {
        const path = proofShotPath(folder, target.ac, "test", evidenceExtension(target.testShot));
        if (shots && (await copyShot(join(shots, target.testShot), fileIn(root, path)))) links.set(target.ac, path);
        else mine[target.ac] = { note: PROOF_COPY.notes.shotUnusable };
        continue;
      }
      server ??= await serverOf(dir, story);
      if (!server.ok) {
        mine[target.ac] = server.output ? { note: server.note, output: server.output } : { note: server.note };
        continue;
      }
      const shot = await capture(pageUrl(server.url, target.page));
      if (!shot.ok || shot.data.length > EVIDENCE_BYTES) {
        mine[target.ac] = { note: PROOF_COPY.notes.pageFailed };
        continue;
      }
      const path = proofShotPath(folder, target.ac, "page", shot.ext);
      await mkdir(dirname(fileIn(root, path)), { recursive: true });
      await writeFile(fileIn(root, path), shot.data);
      links.set(target.ac, path);
    }
    notes.set(key(dir, id), mine);
    if (links.size) await lane.exclusive(() => link(dir, id, links));
    // Scans again, so the card and the review show the screenshots and the notes at once.
    await scan(dir);
    return links.size ? [PROOF_COPY.captured(links.size, folder)] : [];
  }

  return {
    /**
     * Attaches the story's screenshots now that it moved to review; what to tell the agent that moved it. Never
     * throws: what fails is logged, and the move stands.
     */
    attach: (dir: string, id: string): Promise<string[]> =>
      attach(dir, id).catch((err: unknown) => {
        log(`Couldn't attach ${id}'s screenshots: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),

    /** Starts the story's dev server for Preview; its URL, or why it didn't start. */
    async preview(dir: string, id: string): Promise<{ url: string }> {
      const story = await storyIn(dir, id);
      if (!story || !offersPreview(story.config.proof)) throw new ApiError(PROOF_COPY.noPreview(id));
      const server = await serverOf(dir, story);
      if (!server.ok) throw new ApiError(server.output ? `${server.note}\n${server.output}` : server.note);
      return { url: server.url };
    },

    /** The card as the pane and the review show it, with its proof notes and whether it offers Preview. */
    decorate(dir: string, scanned: Scan | null, view: CardView | null): CardView | null {
      if (!view || view.type !== "story") return view;
      const mine = notes.get(key(dir, view.id)) ?? {};
      const found = ownedIn(scanned, view.id);
      const preview =
        offersPreview(scanned?.collected.config.proof ?? null) &&
        found?.root &&
        !samePath(found.root, dir) &&
        !view.merged;
      return {
        ...view,
        acs: view.acs.map((ac, i) => (mine[i] ? { ...ac, proofNote: mine[i] } : ac)),
        ...(preview ? { preview: true as const } : {}),
      };
    },
  };
}

export type ProofCapture = ReturnType<typeof createProofCapture>;

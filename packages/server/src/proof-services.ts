/**
 * The project's proof, wired (STORY-25, ADR 0044): its settings, the stories' dev servers, the screenshots attached
 * when a story moves to review, and the proof question; and the Browser pane's dev servers (STORY-74, ADR 0047).
 * `capture` is the platform boundary: the desktop host's page capture in the app, a fake in tests, and nothing (every
 * page a note) when the server runs on its own.
 */
import { createBrowserPreview } from "./browser-preview.ts";
import type { CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager-types.ts";
import { createDevServers, type DevServerDeps } from "./dev-servers.ts";
import { NO_HOST, type CapturePage } from "./host-capture.ts";
import { createMergeGit } from "./merge-git.ts";
import { createProofCapture } from "./proof-capture.ts";
import { createProofQuestion } from "./proof-question.ts";
import { createProofSettings } from "./proof-settings.ts";
import type { Scan } from "./work-scan.ts";

export interface ProofServicesDeps {
  scan: (dir: string) => Promise<Scan | null>;
  lane: CardLane;
  /** The question is asked on a chat's question card. */
  chats: Pick<ChatManager, "askQuestion">;
  log: (message: string) => void;
  dataDir?: string;
  capture?: CapturePage;
  devServers?: DevServerDeps;
  /** How git runs: a feature's preview checks out its branch (STORY-74). */
  gitCommand?: string;
}

const noCapture: CapturePage = async () => ({ ok: false, error: NO_HOST });

export function createProofServices(deps: ProofServicesDeps) {
  const { scan, lane, chats, log, dataDir, capture, devServers, gitCommand } = deps;
  const settings = createProofSettings({ scan, dataDir });
  const servers = createDevServers(devServers);
  const proofCapture = createProofCapture({ scan, lane, servers, capture: capture ?? noCapture, settings, log });
  const question = createProofQuestion({ scan, chats, settings, log });
  const browser = createBrowserPreview({ scan, git: createMergeGit(gitCommand), servers, settings, log });
  // The card as the pane shows it: its proof notes, Preview, and whether the Browser pane can serve it.
  const shown = {
    ...proofCapture,
    decorate: (...args: Parameters<typeof proofCapture.decorate>) =>
      browser.decorate(args[0], args[1], proofCapture.decorate(...args)),
  };
  return { settings, servers, capture: shown, question, browser };
}

export type ProofServices = ReturnType<typeof createProofServices>;

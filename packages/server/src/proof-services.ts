/**
 * The project's proof, wired (STORY-25, ADR 0044): its settings, the stories' dev servers, the screenshots attached
 * when a story moves to review, and the proof question. `capture` is the platform boundary: the desktop host's page
 * capture in the app, a fake in tests, and nothing (every page a note) when the server runs on its own.
 */
import type { CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager-types.ts";
import { createDevServers, type DevServerDeps } from "./dev-servers.ts";
import { NO_HOST, type CapturePage } from "./host-capture.ts";
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
}

const noCapture: CapturePage = async () => ({ ok: false, error: NO_HOST });

export function createProofServices({ scan, lane, chats, log, dataDir, capture, devServers }: ProofServicesDeps) {
  const settings = createProofSettings({ scan, dataDir });
  const servers = createDevServers(devServers);
  const proofCapture = createProofCapture({ scan, lane, servers, capture: capture ?? noCapture, settings, log });
  const question = createProofQuestion({ scan, chats, settings, log });
  return { settings, servers, capture: proofCapture, question };
}

export type ProofServices = ReturnType<typeof createProofServices>;

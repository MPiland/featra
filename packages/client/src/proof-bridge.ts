/**
 * The proof bridge (STORY-25): Settings > Project > Proof reads the project's proof, its dev server and the folder its
 * tests write screenshots to from the local server, and saves the user's values through it. It rides on the checks
 * bridge, as the Pull requests section does.
 */
import { errorMessage } from "@featra/work-format/guards";
import { normalizeProofView, type ProofPatch, type ProofView } from "@featra/work-format/proof";
import type { ServerClient } from "./server-client.ts";

export type { ProofPatch, ProofView };

export interface ProofSettingsBridge {
  /** The project's proof and its dev server. */
  loadProof: (dir: string) => Promise<ProofView>;
  /** Saves the user's values; answers with the section as it is after, or why not (`error`). */
  setProof: (dir: string, patch: ProofPatch) => Promise<ProofView>;
}

const failed = (error: string): ProofView => ({ ...normalizeProofView({}), error });

const read = (call: Promise<unknown>) => call.then(normalizeProofView, (err: unknown) => failed(errorMessage(err)));

export function serverProof(server: ServerClient): ProofSettingsBridge {
  return {
    loadProof: (dir) => read(server.call("proof.load", { dir })),
    setProof: (dir, patch) => read(server.call("proof.set", { dir, patch })),
  };
}

/** A browser tab has no folders, so no proof. */
export function noProof(error: string): ProofSettingsBridge {
  return { loadProof: async () => failed(error), setProof: async () => failed(error) };
}

export const PROOF_PAGE_COPY = {
  title: "Proof",
  intro: "How stories show they work, beside their tests.",
  proof: "Proof",
  proofHint: "Screenshots are captured from the dev server when a story moves to review. Preview opens it in a window.",
  notChosen: "Not chosen yet",
  modes: [
    { value: "screenshots", label: "Screenshots" },
    { value: "preview", label: "Preview" },
    { value: "both", label: "Both" },
    { value: "none", label: "Neither" },
  ],
  command: "Dev-server command",
  commandHint: "Runs in the story's worktree. Use {port} where the port goes. For example: pnpm dev --port {port}",
  url: "Dev-server URL",
  install: "Install command",
  installHint:
    "Installs dependencies in a feature's fresh checkout before its dev server starts. Leave empty to use the lockfile's: npm ci, pnpm install or yarn install.",
  urlHint: "Where it answers, with its port. For example: http://localhost:5173",
  shots: "Test screenshots folder",
  shotsHint:
    "Where the project's tests write screenshots. A file named STORY-12-ac2.png attaches to STORY-12's second criterion.",
  changed: "Changed in the project's config",
  confirm: "Confirm",
  save: "Save",
  saved: "Saved",
  loading: "Loading…",
} as const;

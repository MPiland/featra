/**
 * A project's proof (STORY-25, ADR 0044): how its stories show they work. Screenshots Featra captures from the
 * project's dev server, a Preview button that opens that server in a window, both, or neither. The setting, the dev
 * server's command and URL, the page an agent lists on a criterion, and the copy the app shows. Pure and light, so
 * the client can import it.
 */
import type { Question } from "./questions.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";

export type ProofMode = "screenshots" | "preview" | "both" | "none";
export const PROOF_MODES: readonly ProofMode[] = ["screenshots", "preview", "both", "none"];
export const isProofMode = (v: unknown): v is ProofMode => isOneOf(PROOF_MODES, v);

/** Whether Featra captures the pages criteria list when a story moves to review. */
export const capturesScreenshots = (mode: ProofMode | null): boolean => mode === "screenshots" || mode === "both";
/** Whether a story offers Preview. */
export const offersPreview = (mode: ProofMode | null): boolean => mode === "preview" || mode === "both";

/** The longest page route or folder a project or an agent can set, in characters. */
export const PROOF_PATH_MAX = 200;

/** What each proof setting may hold, said after its key. */
export const PROOF_RULES = {
  proof: `must be one of ${PROOF_MODES.join(", ")}`,
  devServerUrl: "must be http://localhost:<port> or http://127.0.0.1:<port>",
  testScreenshots: `must be a folder inside the project, a relative path of letters, digits, '.', '_', '-' or '/', at most ${PROOF_PATH_MAX} characters`,
} as const;

const URL_FORM = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})\/?$/;

/** The dev server's port, or null when `url` isn't a loopback http URL with a port. */
export function devServerPort(url: unknown): number | null {
  const m = typeof url === "string" ? URL_FORM.exec(url) : null;
  const port = m ? Number(m[2]) : NaN;
  return port >= 1 && port <= 65535 ? port : null;
}
export const isDevServerUrl = (v: unknown): v is string => devServerPort(v) !== null;

/** The dev server's URL with its port changed: the one Featra picked when the configured one was taken. */
export const withPort = (url: string, port: number): string =>
  url.replace(URL_FORM, (_, host: string) => `http://${host}:${port}`);

/** A folder inside the project: relative, and never out of it. */
export const isScreenshotFolder = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= PROOF_PATH_MAX &&
  /^[\w./-]+$/.test(v) &&
  !v.startsWith("-") &&
  !v.startsWith("/") &&
  !v
    .replace(/\/$/, "")
    .split("/")
    .some((part) => part === "" || part === "." || part === "..");

// A route on the dev server: it starts with one "/", and holds no space or parenthesis, so it fits a card line.
const PAGE_FORM = /^\/(?!\/)[A-Za-z0-9\-._~/?#&=%+:@!$*,;]*$/;

/** Why `page` can't be a criterion's page, or null. */
export function pageError(page: unknown): string | null {
  return typeof page === "string" && page.length <= PROOF_PATH_MAX && PAGE_FORM.test(page)
    ? null
    : `"page" is a route on the project's dev server, such as /settings: it starts with /, has no spaces or parentheses, and is at most ${PROOF_PATH_MAX} characters.`;
}

/**
 * The page's address on the dev server at `base`; null when `page` isn't a route there or would leave its origin. A
 * card's file can hold any page, so this checks it again wherever a page becomes an address.
 */
export function pageUrl(base: string, page: string): string | null {
  if (pageError(page) !== null) return null;
  try {
    const url = new URL(page, base);
    return url.origin === new URL(base).origin ? url.href : null;
  } catch {
    return null;
  }
}

/** Project settings' Proof section. */
export interface ProofView {
  /** The project's proof; null until the user chooses. */
  proof: ProofMode | null;
  devServerCommand: string | null;
  devServerUrl: string | null;
  /** Where the project's own tests write screenshots, relative to the project; null when they don't. */
  testScreenshots: string | null;
  /** Whether the Dev Lead reviews a story's screenshots before Acceptance (STORY-73): the project's choice, else the default. */
  designReview: boolean;
  /** The command in the project's config isn't the one the user confirmed here (changed through git): it doesn't run. */
  unconfirmed: boolean;
  /** Set when the project's config can't be read or a change was refused. */
  error: string | null;
}

/** One change to the Proof settings; `null` clears a value, absent leaves it. */
export interface ProofPatch {
  proof?: ProofMode | null;
  devServerCommand?: string | null;
  devServerUrl?: string | null;
  testScreenshots?: string | null;
  /** Turns the design review of screenshots on or off (STORY-73); null goes back to the default. */
  designReview?: boolean | null;
  /** Confirms the dev-server command now in the project's config as it is. */
  confirm?: boolean;
}

/** A Proof patch read from the socket, or null when it is malformed. */
export function normalizeProofPatch(raw: unknown): ProofPatch | null {
  if (!isRecord(raw)) return null;
  const out: ProofPatch = {};
  const proof = raw.proof;
  if (proof !== undefined) {
    if (proof !== null && !isProofMode(proof)) return null;
    out.proof = proof;
  }
  for (const key of ["devServerCommand", "devServerUrl", "testScreenshots"] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") return null;
    out[key] = value;
  }
  const review = raw.designReview;
  if (review !== undefined) {
    if (review !== null && typeof review !== "boolean") return null;
    out.designReview = review;
  }
  if (raw.confirm === true) out.confirm = true;
  return out;
}

/** Why a criterion has no captured screenshot: shown next to it, as "Evidence missing" is. `output` is the server's tail. */
export interface ProofNote {
  note: string;
  output?: string;
}

/** A criterion's proof note read from the socket, as a spread: empty when there is none or it is malformed. */
export function normalizeProofNote(raw: unknown): { proofNote?: ProofNote } {
  if (!isRecord(raw) || typeof raw.note !== "string" || !raw.note) return {};
  const output = typeof raw.output === "string" && raw.output ? { output: raw.output } : {};
  return { proofNote: { note: raw.note, ...output } };
}

/** The proof notes of a card, by criterion number (0-based). */
export type ProofNotes = Record<number, ProofNote>;

/** The proof question's answers, by the option's label. */
const ANSWERS: Readonly<Record<string, ProofMode>> = {
  Screenshots: "screenshots",
  Preview: "preview",
  Both: "both",
  Neither: "none",
};

export const PROOF_COPY = {
  heading: "Proof",
  notes: {
    noCommand: "No dev-server command set",
    unconfirmed: "Dev-server command not confirmed",
    noUrl: "No dev-server URL set",
    notStarted: "Dev server didn't start",
    pageFailed: "Page didn't load",
    shotUnusable: "Test screenshot over 1 MB or unreadable",
    portTaken: (port: number) =>
      `Port ${port} is in use. Add {port} to the dev-server command so Featra can pick a free one.`,
  },
  preview: "Preview",
  unreadable: "Couldn't read the project's proof settings.",
  noPreview: (id: string) =>
    `${id} has no dev server to preview: it needs its own worktree, and the project's proof needs Preview.`,
  previewTitle: (id: string) => `Preview ${id}`,
  /** What the move to review tells the agent, after Featra captured or attached screenshots. */
  captured: (n: number, folder: string) =>
    `Featra put ${n} screenshot${n === 1 ? "" : "s"} in ${folder}; commit ${n === 1 ? "it" : "them"} with the card.`,
} as const;

/** The question the Dev Lead's chat shows when the project's first feature is shaped (STORY-25). */
export const PROOF_QUESTION: Question = {
  question: "How should stories show they work?",
  header: "Proof",
  multiSelect: false,
  options: [
    {
      label: "Screenshots",
      description: "Featra captures the pages each criterion lists when a story moves to review.",
    },
    { label: "Preview", description: "A Preview button opens the story's dev server in a window." },
    { label: "Both", description: "Screenshots and Preview." },
    { label: "Neither", description: "Stories show their tests only." },
  ],
};

/** The proof the user chose in answer to `PROOF_QUESTION`, or null when the answer isn't one of its options. */
export const proofAnswer = (chosen: readonly string[] | undefined): ProofMode | null =>
  (chosen?.length === 1 && ANSWERS[chosen[0] ?? ""]) || null;

const text = (v: unknown) => (typeof v === "string" && v ? v : null);

/** The Proof section read from the socket; empty, with an error, when it is malformed. */
export function normalizeProofView(raw: unknown): ProofView {
  if (!isRecord(raw)) {
    return {
      proof: null,
      devServerCommand: null,
      devServerUrl: null,
      testScreenshots: null,
      designReview: false,
      unconfirmed: false,
      error: PROOF_COPY.unreadable,
    };
  }
  return {
    proof: isProofMode(raw.proof) ? raw.proof : null,
    devServerCommand: text(raw.devServerCommand),
    devServerUrl: text(raw.devServerUrl),
    testScreenshots: text(raw.testScreenshots),
    designReview: raw.designReview === true,
    unconfirmed: raw.unconfirmed === true,
    error: text(raw.error),
  };
}

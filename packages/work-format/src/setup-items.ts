/**
 * The items the one-screen project setup offers (STORY-42), with what each writes: the scaffold's entries and a
 * starter `.gitignore`. Shared by the server, which writes them, and the client, which lists them.
 */
import { FEATRA_SCAFFOLD, type ScaffoldEntry } from "./scaffold.ts";
import type { SetupItemId } from "./setup-plan.ts";

/**
 * A starter `.gitignore`: short and generic, for any stack. Offered only to a project that has none, since the user's
 * own is never merged into.
 */
const GITIGNORE = `# OS files
.DS_Store
Thumbs.db
desktop.ini

# Dependencies
node_modules/

# Local environment and secrets
.env
.env.*

# Build output
dist/
build/
out/
coverage/
`;

export interface SetupItem {
  id: SetupItemId;
  entry: ScaffoldEntry;
  /** Always set up: the page shows it on and locked. */
  required: boolean;
  /** Offered only while missing; an existing one isn't shown at all (rather than as "Kept"). */
  onlyWhenMissing: boolean;
}

const scaffold = (path: string): ScaffoldEntry => {
  const entry = FEATRA_SCAFFOLD.find((e) => e.path === path);
  if (!entry) throw new Error(`No scaffold entry for ${path}.`);
  return entry;
};

/** The items, in the order the page shows them and setup writes them. */
export const SETUP_ITEMS: readonly SetupItem[] = [
  { id: "featra", entry: scaffold(".featra/config.yaml"), required: true, onlyWhenMissing: false },
  { id: "context", entry: scaffold("CONTEXT.md"), required: false, onlyWhenMissing: false },
  { id: "decisions", entry: scaffold("decisions.md"), required: false, onlyWhenMissing: false },
  { id: "openQuestions", entry: scaffold("open-questions.md"), required: false, onlyWhenMissing: false },
  { id: "adr", entry: scaffold("docs/adr"), required: false, onlyWhenMissing: false },
  {
    id: "gitignore",
    entry: { kind: "file", path: ".gitignore", content: GITIGNORE },
    required: false,
    onlyWhenMissing: true,
  },
];

/** How an entry is named in results: a folder ends in "/". */
export const entryLabel = (entry: ScaffoldEntry): string => (entry.kind === "folder" ? `${entry.path}/` : entry.path);

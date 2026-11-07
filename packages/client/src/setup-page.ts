/**
 * The one-screen project setup (STORY-42): its wording and the rows it shows for a project, worked out from the
 * server's plan. Pure, so the rules are tested directly; the page only renders them.
 */
import { SETUP_ITEMS } from "@featra/work-format/setup-items";
import type { SetupItemId, SetupPlan } from "@featra/work-format/setup-plan";

export const SETUP_PAGE_COPY = {
  title: "Set up project",
  intro: "Choose what Featra adds to this project. Nothing you already have is changed.",
  sections: { repository: "Repository", knowledge: "Project knowledge", workflow: "Workflow" },
  workflowIntro: "Saved in the project, shared through git. You can change these later in Project settings.",
  required: "Required",
  kept: "Kept",
  alreadyGit: "Already a git repository",
  setUp: "Set up",
  settingUp: "Setting up…",
  skip: "Skip",
  done: "Done",
  retry: "Try again",
  loading: "Checking this project…",
  cantCheck: "Can't check this project",
  result: { title: "Project is set up", created: "Created", kept: "Kept", nothing: "Nothing to add." },
  cantSaveWorkflow: "Can't save the workflow settings",
  /** The Project settings button that reopens the page. */
  reopen: "Set up project",
} as const;

/** Each row's name and what it is for. Git isn't a setup item: it always comes first. */
export const ROW_COPY: Record<SetupItemId | "git", { label: string; help: string }> = {
  git: { label: "Git", help: "Featra keeps work in git, so it is shared and versioned." },
  featra: { label: "Featra folder", help: ".featra/ with the project's config." },
  context: { label: "CONTEXT.md", help: "The project's domain language." },
  decisions: { label: "decisions.md", help: "Smaller decisions, newest last." },
  openQuestions: { label: "open-questions.md", help: "Questions that still need an answer." },
  adr: { label: "docs/adr/", help: "Architecture decision records." },
  gitignore: { label: ".gitignore", help: "A starter list: OS files, dependencies, .env files, build output." },
};

/** How a row's checkbox stands: locked on (required, or already there) or the user's choice. */
export type RowState = "required" | "kept" | "choice";

export interface SetupRow {
  id: SetupItemId | "git";
  label: string;
  help: string;
  state: RowState;
}

const row = (id: SetupItemId | "git", state: RowState, help = ROW_COPY[id].help): SetupRow => ({
  id,
  label: ROW_COPY[id].label,
  help,
  state,
});

/**
 * The rows for a project, by section. Git and the Featra folder are required; a knowledge file that is there is
 * kept; a `.gitignore` is offered only to a project that has none.
 */
export function setupRows(plan: Extract<SetupPlan, { ok: true }>): { repository: SetupRow[]; knowledge: SetupRow[] } {
  const exists = (id: SetupItemId) => plan.items.some((i) => i.id === id && i.exists);
  const repository = [row("git", "required", plan.git ? SETUP_PAGE_COPY.alreadyGit : ROW_COPY.git.help)];
  const knowledge: SetupRow[] = [];
  for (const item of SETUP_ITEMS) {
    if (item.onlyWhenMissing && exists(item.id)) continue;
    const state: RowState = exists(item.id) ? "kept" : item.required ? "required" : "choice";
    (item.id === "featra" ? repository : knowledge).push(row(item.id, state));
  }
  return { repository, knowledge };
}

/**
 * What one Set up asks the server for: the ticked items and the ones that are kept, so the result lists those as
 * kept. The server adds the required items itself. In the page's order.
 */
export function itemsToSet(plan: Extract<SetupPlan, { ok: true }>, choice: ReadonlySet<SetupItemId>): SetupItemId[] {
  const { knowledge } = setupRows(plan);
  const wanted = new Set(
    knowledge.flatMap((r) => (r.id !== "git" && (r.state === "kept" || choice.has(r.id)) ? [r.id] : [])),
  );
  return SETUP_ITEMS.flatMap((i) => (wanted.has(i.id) ? [i.id] : []));
}

/** What starts ticked: every item the user can choose. */
export function initialChoice(plan: Extract<SetupPlan, { ok: true }>): ReadonlySet<SetupItemId> {
  const rows = setupRows(plan);
  return new Set(
    [...rows.repository, ...rows.knowledge].flatMap((r) => (r.state === "choice" && r.id !== "git" ? [r.id] : [])),
  );
}

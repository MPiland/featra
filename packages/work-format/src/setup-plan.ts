/**
 * The one-screen project setup (STORY-42): the ids of the items it offers, what the server reports about them before
 * setup, and the params of the one call that sets a project up. Light (no scaffold, no YAML), so the preload can
 * bundle it; the items themselves are in setup-items.ts.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** Each item the setup page can offer. Git isn't one: it is always required and always first. */
export const SETUP_ITEM_IDS = ["featra", "context", "decisions", "openQuestions", "adr", "gitignore"] as const;
export type SetupItemId = (typeof SETUP_ITEM_IDS)[number];

/** Where a project stands before setup: whether it is a git repository, and which items are already there. */
export type SetupPlan =
  | { ok: true; git: boolean; items: { id: SetupItemId; exists: boolean }[] }
  | { ok: false; error: string };

const failure = (r: Record<string, unknown>): { ok: false; error: string } => ({
  ok: false,
  error: typeof r.error === "string" && r.error ? r.error : "Something went wrong.",
});

export function normalizeSetupPlan(raw: unknown): SetupPlan {
  const r = isRecord(raw) ? raw : {};
  if (r.ok !== true || typeof r.git !== "boolean" || !Array.isArray(r.items)) return failure(r);
  const items = r.items.flatMap((i: unknown) =>
    isRecord(i) && isOneOf(SETUP_ITEM_IDS, i.id) && typeof i.exists === "boolean"
      ? [{ id: i.id, exists: i.exists }]
      : [],
  );
  return { ok: true, git: r.git, items };
}

/** The `{ dir, items }` params of `project.setup`, or null. Unknown item ids are refused, not dropped. */
export function setupParams(params: unknown): { dir: string; items: SetupItemId[] } | null {
  if (!isRecord(params) || typeof params.dir !== "string" || !params.dir || !Array.isArray(params.items)) return null;
  const items: unknown[] = params.items;
  if (!items.every((i) => isOneOf(SETUP_ITEM_IDS, i))) return null;
  return { dir: params.dir, items: [...new Set(items)] };
}

/**
 * Reads every copy of every card (ADR 0016): main, each feature branch and each worktree. A location checked out in
 * a working tree is read from disk, so edits show at once; one that isn't is read from git. Deciding which copy
 * counts is work-format's job (`branchStateOf`, `resolveCopies`).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  branchStateOf,
  CARDS_DIR,
  CONFIG_FILE,
  copyKey,
  DEFAULT_CONFIG,
  errorMessage,
  FEATRA_DIR,
  featureIdOfBranch,
  isRecord,
  parseCard,
  parseConfig,
  type BranchState,
  type CardCopy,
  type OwnerLocation,
  type ProjectConfig,
} from "@featra/work-format";
import type { CardIndex } from "./card-index.ts";
import type { RepoGit, RepoPaths, WorktreeInfo } from "./repo-git.ts";

export interface Collected {
  paths: RepoPaths;
  config: ProjectConfig;
  copies: CardCopy[];
  state: BranchState;
  /** The working-tree folder of each checked-out location, by `copyKey(location, "")`. */
  roots: Map<string, string>;
  /** What HEAD has for each working-tree copy, by `copyKey(location, path)`; null when HEAD has no such file. */
  headTexts: Map<string, string | null>;
  problems: string[];
}

export const locationKey = (loc: OwnerLocation) => copyKey(loc, "");

const normalized = (text: string) => text.replace(/\r\n/g, "\n");
const missing = (err: unknown) => isRecord(err) && (err.code === "ENOENT" || err.code === "ENOTDIR");

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

function parsed(location: OwnerLocation, path: string, text: string, workingTree: boolean, edited: boolean): CardCopy {
  try {
    return { location, path, text, card: parseCard(text, path), error: null, workingTree, edited };
  } catch (err) {
    return { location, path, text, card: null, error: errorMessage(err), workingTree, edited };
  }
}

async function readConfig(top: string, problems: string[]): Promise<ProjectConfig> {
  try {
    return parseConfig(await readFile(join(top, ...CONFIG_FILE.split("/")), "utf8"));
  } catch (err) {
    if (!missing(err)) problems.push(`Can't read ${CONFIG_FILE}: ${errorMessage(err)}`);
    return DEFAULT_CONFIG;
  }
}

export interface CollectDeps {
  git: RepoGit;
  index: (paths: RepoPaths) => CardIndex;
}

/** Every copy in the repository `dir` is in, or null when `dir` isn't a Featra project in git. */
export async function collect(dir: string, { git, index }: CollectDeps): Promise<Collected | null> {
  const paths = await git.paths(dir);
  if (!paths || !(await isDir(join(paths.top, FEATRA_DIR)))) return null;
  const { top } = paths;
  const idx = index(paths);
  const blobs = (shas: string[]) => idx.blobs(shas, (m) => git.blobs(top, m));
  const problems: string[] = [];
  const config = await readConfig(top, problems);
  const [trees, branches] = await Promise.all([git.worktrees(top), git.branches(top, config.baseBranch)]);

  const copies: CardCopy[] = [];
  const roots = new Map<string, string>();
  const headTexts = new Map<string, string | null>();

  const fromGit = async (location: OwnerLocation, rev: string) => {
    const files = await git.cardFiles(top, rev);
    const texts = await blobs(files.map((f) => f.sha));
    for (const f of files) copies.push(parsed(location, f.path, texts.get(f.sha) ?? "", false, false));
  };

  const fromDisk = async (location: OwnerLocation, tree: WorktreeInfo) => {
    roots.set(locationKey(location), tree.path);
    const head = tree.head ? await git.cardFiles(top, tree.head) : [];
    const headBlobs = await blobs(head.map((f) => f.sha));
    const inHead = new Map(head.map((f) => [f.path, headBlobs.get(f.sha) ?? ""]));
    let names: string[] = [];
    try {
      names = (await readdir(join(tree.path, ...CARDS_DIR.split("/")))).filter((n) => n.endsWith(".md"));
    } catch (err) {
      if (!missing(err)) problems.push(`Can't read the cards in ${tree.path}: ${errorMessage(err)}`);
    }
    for (const name of names.toSorted()) {
      const path = `${CARDS_DIR}/${name}`;
      let text: string;
      try {
        text = await readFile(join(tree.path, ...path.split("/")), "utf8");
      } catch (err) {
        if (!missing(err)) problems.push(`Can't read ${path} in ${tree.path}: ${errorMessage(err)}`);
        continue;
      }
      const committed = inHead.get(path);
      headTexts.set(copyKey(location, path), committed ?? null);
      const edited = committed === undefined || normalized(committed) !== normalized(text);
      copies.push(parsed(location, path, text, true, edited));
    }
  };

  const treeOf = (branch: string) => trees.find((t) => t.branch === branch);
  const reads: Promise<void>[] = [];
  const base = treeOf(config.baseBranch);
  if (base) reads.push(fromDisk({ kind: "main" }, base));
  else if (branches.some((b) => b.name === config.baseBranch)) {
    reads.push(fromGit({ kind: "main" }, `refs/heads/${config.baseBranch}`));
  }
  for (const b of branches) {
    if (!featureIdOfBranch(b.name)) continue;
    const location: OwnerLocation = { kind: "feature", branch: b.name };
    const tree = treeOf(b.name);
    reads.push(tree ? fromDisk(location, tree) : fromGit(location, `refs/heads/${b.name}`));
  }
  for (const t of trees) {
    if (!t.branch || t.branch === config.baseBranch || featureIdOfBranch(t.branch)) continue;
    reads.push(fromDisk({ kind: "worktree", branch: t.branch, path: t.path }, t));
  }
  await Promise.all(reads);

  const cardBranches = new Map<string, string[]>();
  for (const c of copies) {
    if (!c.card?.branch) continue;
    cardBranches.set(c.card.id, [...(cardBranches.get(c.card.id) ?? []), c.card.branch]);
  }
  const state = branchStateOf({
    baseBranch: config.baseBranch,
    worktrees: trees.map((t) => ({ path: t.path, branch: t.branch })),
    branches,
    cardBranches,
  });
  return { paths, config, copies, state, roots, headTexts, problems };
}

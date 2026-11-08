/**
 * Reads every copy of every card (ADR 0016): main, each feature branch and each worktree. A location checked out in
 * a working tree is read from disk, so edits show at once; one that isn't is read from git. Git's part can be kept
 * for the next scan. Deciding which copy counts is work-format's job (`branchStateOf`, `resolveCopies`).
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
import type { BranchInfo, RepoGit, RepoPaths, WorktreeInfo } from "./repo-git.ts";

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
  /** What git said, for the next rescan to reuse. */
  git: GitState;
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

/** One location to read: from disk with what its HEAD has, or the card files of a commit. */
type Source =
  | { location: OwnerLocation; tree: WorktreeInfo; inHead: Map<string, string> }
  | { location: OwnerLocation; files: { path: string; text: string }[] };

/**
 * What git told one scan. A rescan for a card edit alone reuses it and runs no git (ADR 0016); a change to refs,
 * HEAD or the worktrees, or another base branch in the config, reads it again.
 */
export interface GitState {
  paths: RepoPaths;
  baseBranch: string;
  trees: WorktreeInfo[];
  branches: BranchInfo[];
  sources: Source[];
}

async function readGit(paths: RepoPaths, baseBranch: string, { git, index }: CollectDeps): Promise<GitState> {
  const { top } = paths;
  const idx = index(paths);
  const [trees, branches] = await Promise.all([git.worktrees(top), git.branches(top, baseBranch)]);
  // Each location: from disk with its HEAD's cards, or from a branch's cards in git.
  const plan: { location: OwnerLocation; tree?: WorktreeInfo; rev: string | null }[] = [];
  const treeOf = (branch: string) => trees.find((t) => t.branch === branch);
  const base = treeOf(baseBranch);
  if (base) plan.push({ location: { kind: "main" }, tree: base, rev: base.head });
  else if (branches.some((b) => b.name === baseBranch))
    plan.push({ location: { kind: "main" }, rev: `refs/heads/${baseBranch}` });
  for (const b of branches) {
    if (!featureIdOfBranch(b.name)) continue;
    const tree = treeOf(b.name);
    plan.push({ location: { kind: "feature", branch: b.name }, tree, rev: tree ? tree.head : `refs/heads/${b.name}` });
  }
  for (const t of trees) {
    if (!t.branch || t.branch === baseBranch || featureIdOfBranch(t.branch)) continue;
    plan.push({ location: { kind: "worktree", branch: t.branch, path: t.path }, tree: t, rev: t.head });
  }

  const revs = [...new Set(plan.flatMap((p) => (p.rev ? [p.rev] : [])))];
  const committed = await git.committedCards(top, revs, (shas, load) => idx.blobs(shas, load));
  const sources = plan.map(({ location, tree, rev }): Source => {
    const files = (rev && committed.get(rev)) || [];
    return tree ? { location, tree, inHead: new Map(files.map((f) => [f.path, f.text])) } : { location, files };
  });
  return { paths, baseBranch, trees, branches, sources };
}

/**
 * Every copy in the repository `dir` is in, or null when `dir` isn't a Featra project in git. With `reuse`, git's
 * part comes from that earlier scan, so only the files are read again.
 */
export async function collect(dir: string, deps: CollectDeps, reuse?: GitState): Promise<Collected | null> {
  const paths = reuse?.paths ?? (await deps.git.paths(dir));
  if (!paths || !(await isDir(join(paths.top, FEATRA_DIR)))) return null;
  const problems: string[] = [];
  const config = await readConfig(paths.top, problems);
  const git = reuse?.baseBranch === config.baseBranch ? reuse : await readGit(paths, config.baseBranch, deps);

  const roots = new Map<string, string>();
  const headTexts = new Map<string, string | null>();

  const fromDisk = async (location: OwnerLocation, tree: WorktreeInfo, inHead: Map<string, string>) => {
    roots.set(locationKey(location), tree.path);
    const out: CardCopy[] = [];
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
      out.push(parsed(location, path, text, true, edited));
    }
    return out;
  };

  const read = await Promise.all(
    git.sources.map((s) =>
      "files" in s
        ? Promise.resolve(s.files.map((f) => parsed(s.location, f.path, f.text, false, false)))
        : fromDisk(s.location, s.tree, s.inHead),
    ),
  );
  const copies = read.flat();

  const cardBranches = new Map<string, string[]>();
  for (const c of copies) {
    if (!c.card?.branch) continue;
    cardBranches.set(c.card.id, [...(cardBranches.get(c.card.id) ?? []), c.card.branch]);
  }
  const state = branchStateOf({
    baseBranch: config.baseBranch,
    worktrees: git.trees.map((t) => ({ path: t.path, branch: t.branch })),
    branches: git.branches,
    cardBranches,
  });
  return { paths, config, copies, state, roots, headTexts, problems, git };
}

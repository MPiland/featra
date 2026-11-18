import { cp, readFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Copies a package and everything it needs at run time from the workspace's installed node_modules into a plain
 * `node_modules` folder (STORY-64): the versions pnpm's lockfile installed, with no install and no network. Needs are
 * `dependencies` and `peerDependencies` (a peer marked optional only when it is installed). `optionalDependencies` are
 * left out: the Agent SDK's are Claude Code's own binaries, one per platform, and Featra runs the user's `claude`.
 */

export interface Manifest {
  name: string;
  version: string;
  main?: string;
  license?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

export interface CopiedPackage {
  name: string;
  version: string;
  /** Where it was copied to, from the target `node_modules` folder's parent. */
  at: string;
}

/** A package's package.json; fails, naming the file, when it has no name or version. */
export async function readManifest(dir: string): Promise<Manifest> {
  const file = join(dir, "package.json");
  const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!isManifest(parsed)) throw new Error(`${file} has no name or version.`);
  return parsed;
}

const isManifest = (value: unknown): value is Manifest =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "version" in value &&
  typeof value.version === "string";

/** Node's lookup: `<dir>/node_modules/<name>` in `from` and each folder above it, as its real path; null if none. */
export function findPackage(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    if (basename(dir) !== "node_modules") {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return realpathSync.native(candidate);
    }
    if (dirname(dir) === dir) return null;
  }
}

/** What a package needs at run time: name, and whether it may be missing. */
function needs(m: Manifest): { name: string; optional: boolean }[] {
  const deps = Object.keys(m.dependencies ?? {}).map((name) => ({ name, optional: false }));
  const peers = Object.keys(m.peerDependencies ?? {}).map((name) => ({
    name,
    optional: m.peerDependenciesMeta?.[name]?.optional === true,
  }));
  return [...deps, ...peers];
}

/**
 * Copies `names`, as `from` resolves them, and what they need into `target` (a `node_modules` folder). Each package goes
 * to the top of `target` unless another version holds that place; then it goes in the `node_modules` of the package
 * that needs it, where Node looks first. Links are copied as files. Fails naming a package that isn't installed.
 */
export async function copyPackages(from: string, names: readonly string[], target: string): Promise<CopiedPackage[]> {
  const top = new Map<string, string>(); // name -> real source folder at the top of target
  const copied: CopiedPackage[] = [];
  const done = new Set<string>(); // "<source>|<destination node_modules>"

  async function place(source: string, into: string, parentInto: string | null): Promise<void> {
    const m = await readManifest(source);
    const atTop = top.get(m.name);
    let destRoot = into;
    if (into === target) {
      if (atTop === source) return;
      if (atTop !== undefined) {
        if (parentInto === null) throw new Error(`Two versions of ${m.name} asked for at the top.`);
        destRoot = parentInto;
      } else top.set(m.name, source);
    }
    const key = `${source}|${destRoot}`;
    if (done.has(key)) return;
    done.add(key);
    const dest = join(destRoot, m.name);
    await cp(source, dest, { recursive: true, dereference: true, filter: (src) => !isNested(source, src) });
    copied.push({ name: m.name, version: m.version, at: dest.slice(dirname(target).length + 1).replaceAll("\\", "/") });
    for (const need of needs(m)) {
      const found = findPackage(source, need.name);
      if (found === null) {
        if (need.optional) continue;
        throw new Error(`${m.name} needs ${need.name}, which isn't installed.`);
      }
      await place(found, target, join(dest, "node_modules"));
    }
  }

  for (const name of names) {
    const found = findPackage(from, name);
    if (found === null) throw new Error(`${name} isn't installed for ${from}.`);
    await place(found, target, null);
  }
  return copied;
}

/** A package's own `node_modules` (pnpm's links, `.bin`): its needs are copied by name instead. */
const isNested = (root: string, path: string) => path.slice(root.length).split(/[\\/]/).includes("node_modules");

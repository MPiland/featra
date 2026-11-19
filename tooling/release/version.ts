/**
 * STORY-65, ADR 0040: which release a run of the release workflow makes. Pushing a `vX.Y.Z` tag publishes that
 * version, and the tag must match the app's version (apps/desktop/package.json). Any other run (a manual one, or a
 * pull request that changes the release workflow) is a dry run that builds and tests but publishes nothing.
 */

/** SemVer 2.0: major.minor.patch, with an optional pre-release part (`0.1.0-rc.1`). Build metadata isn't used. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** The pre-release identifiers, `["rc", "1"]` for `-rc.1`; empty for a normal version. */
  pre: string[];
}

/** A SemVer version, or null when the text isn't one. */
export function parseVersion(text: string): Version | null {
  const m = SEMVER.exec(text);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4]?.split(".") ?? [] };
}

/** The version a release tag names: `v0.1.0` is 0.1.0. Null when the tag isn't `v` and a version. */
export const tagVersion = (tag: string): string | null =>
  tag.startsWith("v") && parseVersion(tag.slice(1)) ? tag.slice(1) : null;

/** 0.x releases are pre-releases (ADR 0040), and so is any version with a pre-release part (`1.0.0-rc.1`). */
export function isPrerelease(version: string): boolean {
  const v = parseVersion(version);
  if (!v) throw new Error(`The app's version ${version} isn't a SemVer version, like 0.1.0.`);
  return v.major === 0 || v.pre.length > 0;
}

const compareIds = (a: string, b: string): number => {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an !== bn) return an ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/** SemVer precedence: negative when `a` comes before `b`. A pre-release comes before its normal version. */
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (const [i, id] of a.pre.entries()) {
    const other = b.pre[i];
    if (other === undefined) break;
    const c = compareIds(id, other);
    if (c !== 0) return c;
  }
  return a.pre.length - b.pre.length;
}

/** Fails, naming both versions, when a pushed tag isn't the app's version. */
export function checkTag(tag: string, version: string): void {
  const named = tagVersion(tag);
  if (named === null) {
    throw new Error(`The tag ${tag} isn't a release tag. Release tags are v and the app's version, like v${version}.`);
  }
  if (named !== version) {
    throw new Error(
      `The tag ${tag} is version ${named}, but the app's version is ${version} (apps/desktop/package.json). ` +
        `Tag v${version}, or change the version in a pull request first.`,
    );
  }
}

/** The run that started the workflow, from GitHub's environment. */
export interface WorkflowRun {
  /** GITHUB_EVENT_NAME: `push`, `workflow_dispatch` or `pull_request`. */
  event: string;
  /** GITHUB_REF_TYPE: `tag` or `branch`. */
  refType: string;
  /** GITHUB_REF_NAME: the tag or branch. */
  refName: string;
}

export interface ReleasePlan {
  version: string;
  /** The release's tag: the pushed one, or the one a dry run would publish to. */
  tag: string;
  prerelease: boolean;
  /** Only a pushed tag publishes; every other run is a dry run. */
  publish: boolean;
}

/** What this run releases: checks the tag before anything is built, and decides whether it publishes. */
export function planRelease(run: WorkflowRun, version: string): ReleasePlan {
  const prerelease = isPrerelease(version);
  if (run.event === "push" && run.refType === "tag") {
    checkTag(run.refName, version);
    return { version, tag: run.refName, prerelease, publish: true };
  }
  return { version, tag: `v${version}`, prerelease, publish: false };
}

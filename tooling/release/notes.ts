import { compareVersions, parseVersion, tagVersion } from "./version.ts";

/**
 * STORY-65: a release's notes. They list the pull requests merged since the last release, say the installers are
 * unsigned and link the install guide, and give each installer's SHA-256 checksum, as `SHA256SUMS.txt` does.
 */

/** The checksums file attached to a release, in `sha256sum`'s format so `sha256sum -c` checks a download. */
export const CHECKSUMS_FILE = "SHA256SUMS.txt";
/** The notes file the publish job hands to `gh release create`. */
export const NOTES_FILE = "notes.md";

/** Separators for `git log --format`: between a commit's subject and body, and between commits. */
export const FIELD = "\x1f";
export const RECORD = "\x1e";
/** The `git log` format `mergedPullRequests` reads. */
export const MERGE_LOG_FORMAT = `%s${FIELD}%b${RECORD}`;

export interface MergedPullRequest {
  /** The pull request's number; null for a card merged locally, which has none. */
  number: number | null;
  title: string;
}

const MERGE_SUBJECT = /^Merge pull request #(\d+) from (\S+)/;
/** A card merged locally, before every merge went through GitHub: `Merge FEAT-6: PRs, CI, merges and bugs`. */
const LOCAL_MERGE_SUBJECT = /^Merge ((?:EPIC|FEAT|STORY|BUG)-\d+): (.+)$/;

/**
 * The pull requests in `git log --merges --format=<MERGE_LOG_FORMAT>` output, each once, as git lists them. GitHub's
 * merge commit names the pull request in its subject and puts its title on the body's first line. A card merged
 * locally (`Merge STORY-12: <title>`) is listed too, by its id and title, once (the user's call, 2026-11-19); syncs
 * such as `Merge main into …`, and merges that name no card, are not changes.
 */
export function mergedPullRequests(log: string): MergedPullRequest[] {
  const seen = new Set<string>();
  const prs: MergedPullRequest[] = [];
  for (const record of log.split(RECORD)) {
    const [subject = "", body = ""] = record.replace(/^\s+/, "").split(FIELD);
    const local = LOCAL_MERGE_SUBJECT.exec(subject);
    if (local) {
      if (seen.has(local[1] ?? "")) continue;
      seen.add(local[1] ?? "");
      prs.push({ number: null, title: `${local[1]}: ${local[2]?.trim()}` });
      continue;
    }
    const m = MERGE_SUBJECT.exec(subject);
    if (!m || seen.has(`#${m[1]}`)) continue;
    seen.add(`#${m[1]}`);
    const title =
      body
        .split("\n")
        .find((line) => line.trim() !== "")
        ?.trim() ??
      m[2] ??
      "";
    prs.push({ number: Number(m[1]), title });
  }
  return prs;
}

/**
 * The last release before `tag`: the highest release tag that comes before it. Null for the first release. A full
 * release (no pre-release part) counts only full releases, so its notes list everything since the last one, not since
 * its own release candidate (the user's call); a pre-release counts every release tag.
 */
export function previousTag(tags: readonly string[], tag: string): string | null {
  const current = parseVersion(tagVersion(tag) ?? "");
  if (!current) throw new Error(`The tag ${tag} isn't a release tag, like v0.1.0.`);
  const full = current.pre.length === 0;
  let best: { tag: string; version: NonNullable<ReturnType<typeof parseVersion>> } | null = null;
  for (const t of tags) {
    const version = parseVersion(tagVersion(t) ?? "");
    if (!version || compareVersions(version, current) >= 0) continue;
    if (full && version.pre.length > 0) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { tag: t, version };
  }
  return best?.tag ?? null;
}

export interface Checksum {
  file: string;
  sha256: string;
}

/** The checksums file's text: one `<sha256>  <file>` line per installer, by file name. */
export const checksumsText = (checksums: readonly Checksum[]): string =>
  checksums
    .toSorted((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((c) => `${c.sha256}  ${c.file}\n`)
    .join("");

export interface NotesInput {
  version: string;
  /** The last release's tag, or null for the first release. */
  previous: string | null;
  prs: readonly MergedPullRequest[];
  checksums: readonly Checksum[];
  /** docs/install.md at this release's tag. */
  installGuide: string;
}

/** The release's notes, in Markdown. */
export function releaseNotes({ version, previous, prs, checksums, installGuide }: NotesInput): string {
  const changes = prs.length
    ? prs.map((pr) => (pr.number === null ? `- ${pr.title}` : `- ${pr.title} (#${pr.number})`))
    : ["- No pull requests were merged."];
  return [
    `Featra ${version} for Windows, macOS and Linux.`,
    "",
    "## Unsigned build",
    "",
    "These installers aren't signed yet, so Windows and macOS warn the first time Featra opens. " +
      `The [install guide](${installGuide}) shows how to open it anyway, ` +
      "and what Featra needs: `git`, `gh` and `claude`.",
    "",
    previous ? `## Changes since ${previous}` : "## Changes",
    "",
    ...changes,
    "",
    "## SHA-256 checksums",
    "",
    `Also in \`${CHECKSUMS_FILE}\`, for \`sha256sum -c\`.`,
    "",
    "```",
    checksumsText(checksums).trimEnd(),
    "```",
    "",
  ].join("\n");
}

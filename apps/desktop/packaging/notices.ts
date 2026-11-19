import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyPackages, licenseFileOf, readManifest, type CopiedPackage } from "./modules.ts";
import { DESKTOP } from "./paths.ts";
import { RUNTIME_PACKAGES } from "./runtime-packages.ts";

/**
 * The third-party notices the installed app carries (STORY-64): each package in its `node_modules`, with its licence as
 * the package states it. Generated from the staged folder, never written by hand; the repo keeps a copy
 * (`apps/desktop/THIRD-PARTY-NOTICES.md`) that a test holds equal to what staging writes.
 */
export const NOTICES_FILE = "THIRD-PARTY-NOTICES.md";
export const REPO_NOTICES = join(DESKTOP, NOTICES_FILE);

/**
 * Packages bundled under their owner's terms rather than an open licence. The Agent SDK is Anthropic's, bundled as other
 * apps that drive Claude Code do (decisions.md, 2026-11-18).
 */
export const TERMS: Readonly<Record<string, string>> = {
  "@anthropic-ai/claude-agent-sdk":
    "© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service: " +
    "https://www.anthropic.com/legal/commercial-terms",
};

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\..*)?$/i;

/** The notices for `packages`, as staged in `app` (the folder holding `node_modules`): one section each, by name. */
export async function thirdPartyNotices(app: string, packages: readonly CopiedPackage[]): Promise<string> {
  const unique = new Map(packages.map((p) => [`${p.name}@${p.version}`, p]));
  const sections = [...unique.values()]
    .toSorted((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1))
    .map((p) => section(join(app, p.at), p));
  const header =
    "# Third-party notices\n\nFeatra is MIT licensed (LICENSE). The installed app also carries these packages, each " +
    "under its own terms.\n";
  return [header, ...(await Promise.all(sections))].join("\n").replace(/\n+$/, "\n");
}

async function section(dir: string, p: CopiedPackage): Promise<string> {
  const title = `## ${p.name} ${p.version}\n\n`;
  const terms = TERMS[p.name];
  if (terms) return `${title}${terms}\n`;
  const manifest = await readManifest(dir);
  const named = licenseFileOf(manifest);
  const files = named ? [named] : (await readdir(dir)).filter((f) => LICENSE_FILE.test(f)).toSorted();
  const texts = await Promise.all(files.map((f) => readFile(join(dir, f), "utf8")));
  const license = named ? `See ${named}` : (manifest.license ?? "No licence stated");
  const body = texts.map((t) => `\n\`\`\`text\n${plain(t)}\n\`\`\`\n`).join("");
  return `${title}License: ${license}\n${body}`;
}

/** A licence's text as Markdown keeps it: LF line ends, no trailing spaces, no blank lines around it. */
const plain = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

/** Writes the notices into the staged app. */
export async function writeNotices(app: string, packages: readonly CopiedPackage[]): Promise<string> {
  const text = await thirdPartyNotices(app, packages);
  await writeFile(join(app, NOTICES_FILE), text);
  return text;
}

/** `node packaging/notices.ts`: stages the app's node_modules alone and writes the repo's copy. */
async function main() {
  const app = await mkdtemp(join(tmpdir(), "featra-notices-"));
  try {
    const packages = await copyPackages(DESKTOP, RUNTIME_PACKAGES, join(app, "node_modules"));
    await writeFile(REPO_NOTICES, await thirdPartyNotices(app, packages));
    process.stdout.write(`Wrote ${REPO_NOTICES} (${packages.length} packages)\n`);
  } finally {
    await rm(app, { recursive: true, force: true });
  }
}

if (process.argv[1] === import.meta.filename) await main();

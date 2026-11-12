// A stand-in for the GitHub CLI (STORY-11): the platform faked, never Featra's own logic. It keeps its GitHub in a JSON
// file (FAKE_GH_STATE): whether it is signed in and the repo's PRs. Each call is appended to FAKE_GH_STATE + ".calls"
// as one JSON line with its arguments and what came in on standard input. A PR's head commit is the tip of its branch
// in the bare repository that stands in for GitHub (`remote`), as on GitHub. Workflow runs (`runs`) belong to a commit and
// hold artifacts, each a set of files that `run download` writes out as GitHub's CLI does.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const statePath = process.env.FAKE_GH_STATE;
const read = () => JSON.parse(fs.readFileSync(statePath, "utf8"));
const write = (state) => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const args = process.argv.slice(2);
const input = args.includes("--input") ? fs.readFileSync(0, "utf8") : "";
fs.appendFileSync(`${statePath}.calls`, `${JSON.stringify({ args, input })}\n`);

const out = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const fail = (message, code = 1) => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const state = read();
const OWNER = "acme";
const REPO = "app";

/** The tip of `branch` in the remote, as GitHub would have it; null when the remote doesn't have it. */
function tipOf(branch) {
  if (!state.remote) return null;
  try {
    const oid = execFileSync("git", [
      "--git-dir",
      state.remote,
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`,
    ]);
    return String(oid).trim() || null;
  } catch {
    return null;
  }
}

/** The PR's checks: those of its head commit when they are kept per commit, else its own. */
const checksOf = (pr) => (pr.checksAt ? (pr.checksAt[tipOf(pr.head) ?? ""] ?? []) : (pr.checks ?? []));

const view = (pr) => ({
  number: pr.number,
  url: pr.url,
  state: pr.state,
  isDraft: pr.isDraft === true,
  statusCheckRollup: checksOf(pr),
  headRefOid: tipOf(pr.head) ?? undefined,
  headRepository: { name: REPO },
  headRepositoryOwner: { login: pr.headOwner ?? OWNER },
});

/** GitHub's bucket for a check run or a commit status. */
function bucketOf(check) {
  const status = String(check.status ?? "").toUpperCase();
  const outcome = String(check.conclusion ?? check.state ?? "").toUpperCase();
  if ("conclusion" in check && status !== "COMPLETED") return "pending";
  if (["SUCCESS", "NEUTRAL"].includes(outcome)) return "pass";
  if (outcome === "SKIPPED") return "skipping";
  if (outcome === "CANCELLED") return "cancel";
  if (["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(outcome)) return "fail";
  return "pending";
}

/** An artifact name matched against `run download -p`: `*` any characters, `?` one. */
const matches = (pattern, name) =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")
      .replaceAll("?", ".")}$`,
  ).test(name);

/** A workflow run as `gh run list --json` gives it. */
const runView = (run) => ({
  databaseId: run.id,
  status: run.status ?? "completed",
  conclusion: run.conclusion ?? "success",
  headSha: run.headSha,
});

const [first, second] = args;
if (first === "--version") {
  out("gh version 2.99.0 (fake)");
} else if (first === "auth" && second === "status") {
  if (!state.signedIn) fail("You are not logged into any GitHub hosts. To log in, run: gh auth login");
  process.stdout.write("github.com\n  Logged in to github.com account fake\n");
} else if (first === "pr" && second === "list") {
  const head = flag("--head");
  const base = flag("--base");
  const found = state.prs.filter((pr) => pr.head === head && pr.state === "OPEN" && (!base || pr.base === base));
  out(found.map(view));
} else if (first === "pr" && second === "view") {
  if (state.viewDelayMs) sleep(state.viewDelayMs);
  const pr = state.prs.find((p) => p.url === args[2]);
  if (!pr) fail("GraphQL: Could not resolve to a PullRequest");
  out(view(pr));
} else if (first === "pr" && second === "checks") {
  const pr = state.prs.find((p) => p.url === args[2]);
  if (!pr) fail("GraphQL: Could not resolve to a PullRequest");
  const required = args.includes("--required");
  const checks = checksOf(pr).filter((c) => !required || (pr.required ?? []).includes(c.name));
  if (checks.length === 0) fail(`no ${required ? "required " : ""}checks reported on the '${pr.head}' branch`);
  out(checks.map((c) => ({ bucket: bucketOf(c), name: c.name })));
} else if (first === "api" && second === "repos/{owner}/{repo}/pulls" && flag("--method") === "POST") {
  if (state.createFails) fail(state.createFails);
  // The user changes the card while GitHub opens the PR.
  if (state.whileCreating) fs.writeFileSync(state.whileCreating.file, state.whileCreating.text);
  const body = JSON.parse(input);
  const same = (p) => p.head === body.head && p.base === body.base && p.state === "OPEN" && !p.headOwner;
  if (state.prs.some(same)) {
    fail(`gh: A pull request already exists for ${OWNER}:${body.head}. (HTTP 422)`);
  }
  const number = state.next++;
  const pr = { number, url: `https://github.com/${OWNER}/${REPO}/pull/${number}`, state: "OPEN", ...body };
  state.prs.push(pr);
  write(state);
  const head = { sha: tipOf(body.head) ?? undefined, repo: { full_name: `${OWNER}/${REPO}` } };
  out({ number, html_url: pr.url, state: "open", draft: false, merged_at: null, head });
} else if (first === "run" && second === "list") {
  const commit = flag("--commit");
  const limit = Number(flag("--limit") ?? 20);
  out(
    (state.runs ?? [])
      .filter((r) => !commit || r.headSha === commit)
      .slice(0, limit)
      .map(runView),
  );
} else if (first === "run" && second === "download") {
  if (state.downloadFails) fail(state.downloadFails);
  const run = (state.runs ?? []).find((r) => String(r.id) === args[2]);
  if (!run) fail(`HTTP 404: Not Found`);
  const pattern = flag("-p");
  const into = flag("-D") ?? ".";
  const wanted = Object.entries(run.artifacts ?? {}).filter(([name]) => !pattern || matches(pattern, name));
  if (wanted.length === 0) fail("no valid artifacts found to download");
  // With a pattern, each artifact goes into a folder of its own name, as GitHub's CLI does.
  for (const [name, files] of wanted) {
    for (const [file, text] of Object.entries(files)) {
      const to = path.join(into, name, file);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, text);
    }
  }
} else {
  fail(`unknown command: ${args.join(" ")}`);
}

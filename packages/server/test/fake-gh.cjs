// A stand-in for the GitHub CLI (STORY-11): the platform faked, never Featra's own logic. It keeps its GitHub in a JSON
// file (FAKE_GH_STATE): whether it is signed in and the repo's PRs. Each call is appended to FAKE_GH_STATE + ".calls"
// as one JSON line with its arguments and what came in on standard input.
const fs = require("node:fs");

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
const view = (pr) => ({
  number: pr.number,
  url: pr.url,
  state: pr.state,
  isDraft: pr.isDraft === true,
  statusCheckRollup: pr.checks ?? [],
});

const state = read();
const [first, second] = args;
if (first === "--version") {
  out("gh version 2.99.0 (fake)");
} else if (first === "auth" && second === "status") {
  if (!state.signedIn) fail("You are not logged into any GitHub hosts. To log in, run: gh auth login");
  process.stdout.write("github.com\n  Logged in to github.com account fake\n");
} else if (first === "pr" && second === "list") {
  const head = flag("--head");
  out(state.prs.filter((pr) => pr.head === head && pr.state === "OPEN").map(view));
} else if (first === "pr" && second === "view") {
  const pr = state.prs.find((p) => p.url === args[2]);
  if (!pr) fail("GraphQL: Could not resolve to a PullRequest");
  out(view(pr));
} else if (first === "api" && second === "repos/{owner}/{repo}/pulls" && flag("--method") === "POST") {
  if (state.createFails) fail(state.createFails);
  const body = JSON.parse(input);
  if (state.prs.some((p) => p.head === body.head && p.state === "OPEN")) {
    fail(`gh: A pull request already exists for acme:${body.head}. (HTTP 422)`);
  }
  const number = state.next++;
  const pr = { number, url: `https://github.com/acme/app/pull/${number}`, state: "OPEN", ...body };
  state.prs.push(pr);
  write(state);
  out({ number, html_url: pr.url, state: "open", draft: false, merged_at: null });
} else {
  fail(`unknown command: ${args.join(" ")}`);
}

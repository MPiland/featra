/**
 * Points git at the committed hooks in `.githooks` (ADR 0014). Runs as the root `prepare` script, so `pnpm install`
 * sets it up. The path is relative, so every worktree runs the hooks of its own checkout. Outside a git checkout
 * (an unpacked tarball, say) there is nothing to set up.
 */
import { execFileSync } from "node:child_process";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

let insideCheckout = false;
try {
  insideCheckout = git("rev-parse", "--is-inside-work-tree").trim() === "true";
} catch {
  // Not a git checkout, or git isn't installed.
}
if (insideCheckout) git("config", "core.hooksPath", ".githooks");

#!/usr/bin/env bash
# The WSL half of `pnpm test:e2e:wsl` (tooling/e2e/wsl.ts starts it). Copies this working tree, uncommitted changes
# included, into the distro's own disk, installs Linux dependencies there and runs the e2e suite under Xvfb.
# The Windows checkout's node_modules hold Windows binaries, so the run can't use them in place.
#
#   tooling/e2e/wsl-run.sh <name> [playwright args]
set -euo pipefail

name="$1"
shift
src="$(cd "$(dirname "$0")/../.." && pwd)"
dest="$HOME/featra-e2e/$name"

# WSL appends the Windows PATH, which has a Windows node and pnpm: put the Linux ones first.
export PATH="$HOME/.local/node/bin:/usr/local/bin:/usr/bin:/bin"
command -v node >/dev/null || { echo "wsl-run.sh: no node in ~/.local/node/bin" >&2; exit 1; }

mkdir -p "$dest"
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude dist --exclude test-results --exclude playwright-report \
  --filter=':- .gitignore' "$src/" "$dest/"
cd "$dest"
echo "wsl-run.sh: running in $dest" >&2
pnpm install --frozen-lockfile --reporter=silent
exec tooling/e2e/xvfb.sh pnpm --filter @featra/desktop test:e2e "$@"

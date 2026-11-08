#!/usr/bin/env bash
# Runs a command on a private Xvfb display with the Openbox window manager: the Linux desktop the e2e suite runs on,
# on CI and in WSL (decisions.md, 2026-11-07). Nothing reaches a real screen, WSLg included.
#
#   tooling/e2e/xvfb.sh pnpm --filter @featra/desktop test:e2e [playwright args]
#
# Openbox comes from PATH (CI installs it with apt). Without it and without root, as in WSL, the script unpacks the
# distro's own openbox packages into ~/.cache/featra-openbox once (apt-get download needs no root).
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: tooling/e2e/xvfb.sh <command> [args...]" >&2
  exit 2
fi

# The window manager must manage these, or tests about maximising, minimising and focus would skip or prove nothing.
REQUIRED_ATOMS=(_NET_ACTIVE_WINDOW _NET_WM_STATE_MAXIMIZED_VERT _NET_WM_STATE_HIDDEN)

for tool in Xvfb xprop; do
  if ! command -v "$tool" >/dev/null; then
    echo "xvfb.sh: $tool is missing. Install it: sudo apt-get install xvfb x11-utils" >&2
    exit 1
  fi
done

openbox_cmd=()
if command -v openbox >/dev/null; then
  openbox_cmd=(openbox)
else
  root="${XDG_CACHE_HOME:-$HOME/.cache}/featra-openbox"
  if [ ! -x "$root/usr/bin/openbox" ]; then
    echo "xvfb.sh: unpacking openbox into $root (no root needed)" >&2
    work="$(mktemp -d)"
    # openbox plus whichever of its library dependencies this system doesn't have.
    mapfile -t wanted < <(apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks \
      --no-replaces --no-enhances openbox | grep -E '^[a-z0-9]' | sort -u)
    missing=()
    for pkg in "${wanted[@]}"; do
      dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed' || missing+=("$pkg")
    done
    (cd "$work" && apt-get download "${missing[@]}" >/dev/null)
    for deb in "$work"/*.deb; do dpkg-deb -x "$deb" "$work/root"; done
    mkdir -p "$(dirname "$root")"
    rm -rf "$root"
    mv "$work/root" "$root"
    rm -rf "$work"
  fi
  # Only openbox sees the unpacked libraries and themes; the command under test keeps its own environment.
  openbox_cmd=(env "LD_LIBRARY_PATH=$root/usr/lib/x86_64-linux-gnu" "XDG_DATA_DIRS=$root/usr/share:/usr/share"
    "$root/usr/bin/openbox" --config-file "$root/etc/xdg/openbox/rc.xml")
fi

logs="$(mktemp -d)"
xvfb_pid=""
wm_pid=""
cleanup() {
  [ -n "$wm_pid" ] && kill "$wm_pid" 2>/dev/null || true
  [ -n "$xvfb_pid" ] && kill "$xvfb_pid" 2>/dev/null || true
  rm -rf "$logs"
}
trap cleanup EXIT

listen=(-nolisten tcp)
# WSLg mounts /tmp/.X11-unix read-only: there, listen on Linux's abstract socket only, which X clients try first.
if [ -d /tmp/.X11-unix ] && [ ! -w /tmp/.X11-unix ]; then listen+=(-nolisten unix); fi
# From display 99 up, never a low number a real desktop uses (WSLg is :0). Xvfb's lock file in /tmp refuses a
# display another server holds; -displayfd writes the number once the server is ready.
display=""
for n in $(seq 99 199); do
  : >"$logs/display"
  Xvfb ":$n" -displayfd 3 -screen 0 1920x1080x24 "${listen[@]}" 3>"$logs/display" 2>"$logs/xvfb.log" &
  xvfb_pid=$!
  for _ in $(seq 100); do
    [ -s "$logs/display" ] && break
    kill -0 "$xvfb_pid" 2>/dev/null || break
    sleep 0.1
  done
  if [ -s "$logs/display" ]; then
    display="$n"
    break
  fi
  kill "$xvfb_pid" 2>/dev/null || true
  xvfb_pid=""
done
if [ -z "$display" ]; then
  cat "$logs/xvfb.log" >&2
  echo "xvfb.sh: Xvfb didn't start on any display from :99 to :199" >&2
  exit 1
fi
export DISPLAY=":$display"
# Keep the app on this X display: Electron would pick WSLg's Wayland compositor if it could see one.
unset WAYLAND_DISPLAY
export XDG_SESSION_TYPE=x11

"${openbox_cmd[@]}" >"$logs/openbox.log" 2>&1 &
wm_pid=$!
ready=""
for _ in $(seq 100); do
  supported="$(xprop -root _NET_SUPPORTED 2>/dev/null || true)"
  ready=yes
  for atom in "${REQUIRED_ATOMS[@]}"; do
    [[ "$supported" == *"$atom"* ]] || ready=""
  done
  [ -n "$ready" ] && break
  kill -0 "$wm_pid" 2>/dev/null || break
  sleep 0.1
done
if [ -z "$ready" ]; then
  cat "$logs/openbox.log" >&2
  echo "xvfb.sh: openbox didn't come up managing ${REQUIRED_ATOMS[*]}" >&2
  exit 1
fi
echo "xvfb.sh: DISPLAY=$DISPLAY, window manager openbox" >&2

set +e
"$@"
status=$?
set -e
exit "$status"

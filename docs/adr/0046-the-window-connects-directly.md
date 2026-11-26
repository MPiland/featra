# 0046 — The window connects directly, without the system's proxy settings

Date: 2026-11-26 · Status: proposed

## Context

The window's page talks to the local server over a WebSocket on 127.0.0.1 (ADR 0015). Chromium decides a proxy for
every request, the server's included, from the system's settings. On Windows those settings can tell it to look for a
proxy first (automatic detection, WPAD, or a proxy script), and until that look-up ends every request waits, even one
to 127.0.0.1 that would go direct anyway.

BUG-40 measured this on the E2E (Windows) runners. The page got the server's address a few milliseconds after it asked,
then its socket took 291 ms on average to open (9 to 823 ms, 95 launches), against 49 ms on Ubuntu and 26 ms on macOS.
Twice the look-up took about 4.75 s, and the first answers missed a test's 5 s wait. A user on a network with a slow
proxy script would see the same: "Loading…" for seconds, or 30 s when the script never answers.

The options were:

- `--no-proxy-server` on the command line: direct everywhere, including the separate session that captures a story's
  dev-server pages (ADR 0044), whose pages may load assets from the internet that a company network only reaches
  through its proxy.
- Bypass rules for loopback: Chromium applies them only once the look-up has ended, so the wait stays.
- A direct-only proxy setting on the window's session alone.

## Decision

The window's session (Electron's default session) connects directly: `setProxy({ mode: "direct" })`, set as the app is
ready and before the window is created. The window loads only bundled files and talks only to the local server, so it
has no use for a proxy. Other sessions, such as the dev-server captures, keep the system's settings.

## Consequences

- The page's first answers no longer wait on the system's proxy settings; `startup-proxy.spec.ts` proves it against a
  proxy script that never answers.
- Anything added later that loads from the internet in the window's session (it should not: the window shows only the
  bundled client) would bypass a company proxy. Such content belongs in its own session.
- `main.log` records when the page asks for the server's address and when the server hears it connect, so a late
  connection shows where the time went.

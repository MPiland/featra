# 0046 — The window's session: in memory and direct

Date: 2026-11-27 · Status: proposed

## Context

The window's page talks to the local server over a WebSocket on 127.0.0.1 (ADR 0015). Before Chromium sends any
request, the server's included, it does two things that have nothing to do with this computer's own server:

- It decides a proxy from the system's settings. On Windows those can tell it to look for a proxy first (automatic
  detection, WPAD, or a proxy script), and until that look-up ends every request waits, even one to 127.0.0.1.
- In a persistent session (Electron's default), it loads the profile's cookie database from disk.

BUG-40 measured both on the E2E (Windows) runners. With the default session the page got the server's address in a few
milliseconds, then its socket took 291 ms on average to open (9 to 823 ms, 95 launches), against 49 ms on Ubuntu and
26 ms on macOS. With the proxy set to direct, Chromium's net log showed the socket waiting on
`COOKIE_PERSISTENT_STORE_LOAD`: 0.2 s in a good launch, and in one failed launch over 5 s, longer than the test's wait
for the first answers. A user on a slow disk, or with a slow proxy script, would see "Loading…" for as long.

The page keeps nothing in its session: its UI state, settings and projects go through the main process (the browser
bridge's localStorage is only for the client run in a plain browser). The options were:

- `--no-proxy-server` on the command line: direct everywhere, including the session that captures a story's
  dev-server pages (ADR 0044), whose pages may load assets that a company network only reaches through its proxy. It
  leaves the cookie load.
- Warming the cookie store at startup: the load overlaps startup but still runs, and a slow one still holds the page.
- A session for the window alone, in memory and with a direct proxy setting.

## Decision

The window uses its own session, partition `featra` (no `persist:` prefix, so it keeps nothing on disk), and that
session connects directly: `setProxy({ mode: "direct" })`, set as the app is ready and before the window is created.
The window loads only bundled files and talks only to the local server, so it needs neither a proxy nor stored
cookies. Electron's default session connects directly too: the app loads nothing in it, yet with only the window's
session direct, Chromium still fetched the proxy script for it at startup on the E2E (Windows) and E2E (macOS)
runners. Other sessions, such as the dev-server captures, keep the system's settings.

## Consequences

- The page's first answers wait on neither the system's proxy settings nor the disk. `startup-proxy.spec.ts` proves the
  first against a proxy script that never answers. `startup-session.spec.ts` proves the window's session keeps nothing
  on disk.
- Anything the page might keep in web storage (localStorage, IndexedDB, cookies) would be gone at the next launch. The
  page must keep its state through the main process, as it does.
- Anything added later that loads from the internet in the window (it should not: the window shows only the bundled
  client) would bypass a company proxy. Such content belongs in its own session.
- Help > Troubleshooting still clears Electron's default session, which holds what earlier versions stored on disk.
- `main.log` records when the page asks for the server's address and when the server hears it connect, so a late
  connection shows where the time went.

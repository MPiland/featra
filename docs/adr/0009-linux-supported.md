# 0009 — Linux is a supported M1 platform

Date: 2026-11-05 · Status: accepted

## Context

Many developers who direct agents work on Linux. Electron runs there, but desktop behaviour varies:

- GNOME has no tray by default.
- Trays often ignore clicks.
- Some window managers don't support minimizing.

## Decision

Windows, macOS and Linux are all supported in M1. Each story's tests also run on Linux: Ubuntu under WSL2, in both
WSLg and xvfb. Where Linux desktops differ, the app detects what the desktop supports instead of assuming:

- The tray always has a right-click menu.
- With no tray host, closing the window quits.
- Behaviour that depends on the window manager is detected, not assumed.

## Consequences

- Every story's Definition of Done includes a Linux e2e run.
- Platform differences sit behind small detection functions (for example `hasTrayHost`) that are tested directly.
- Tests that depend on the window manager assert what was requested, plus the outcome where the window manager supports it.
